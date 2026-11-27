import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { withErrorHandler } from "@/utils/errors";
import { verifyCronRequest } from "@/lib/cronAuth";
import { deleteR2Objects } from "@/lib/r2Delete";
import {
  PHOTO_RETENTION_MONTHS,
  SUPPORT_RETENTION_MONTHS,
  WEBHOOK_EVENT_RETENTION_DAYS,
  collectPhotoKeys,
  isPastRetention,
  retentionCutoff,
} from "@/lib/compliance/retention";
import { releaseExpiredWalletHolds } from "@/lib/paypal/walletHolds";

/**
 * POST /api/admin/compliance/retention/purge
 *
 * The scheduled half of Privacy Policy §8. Sessions were the easy part; this is
 * what makes "inspection photos: 24 months after delivery" and "support
 * conversations: 24 months after the ticket closes" true instead of aspirational.
 *
 * Runs daily from `.github/workflows/retention-purge.yml`, authenticated with the
 * same timestamp + HMAC scheme as the quote sweep (`CRON_SECRET`).
 *
 * Deliberately NOT purged here:
 * - orders, invoices and payment records, which §8 keeps for 8 years;
 * - anything with an unparseable timestamp, because guessing would delete live
 *   data on a parse failure.
 *
 * Retention of the operational collections this route does own:
 * - `paypalWebhookEvents` — idempotency markers, deleted 30 days after the
 *   event was claimed (WEBHOOK_EVENT_RETENTION_DAYS). A marker only has to
 *   outlive PayPal's redelivery window (~3 days); without this purge the
 *   collection grows by one document per webhook forever.
 * - `walletHolds` — self-cleaning: a hold is deleted by the settlement
 *   transaction that consumes it, and abandoned checkouts are released the
 *   next time that customer checks out. This route additionally releases
 *   anything still expired, so a customer who never returns does not leave a
 *   hold behind forever.
 * - `migrations` — one document per migration; bounded by the migration
 *   count, so there is nothing to purge.
 * - `adminAuditLog` — the audit trail; retained by design, the same way §8
 *   keeps financial records.
 *
 * Paging: each run processes one bounded page and stores a cursor in
 * `system/retention`, so a scan that meets fifty photo-less requests does not get
 * stuck re-reading them forever. When the page is short the cursor resets, which
 * starts the next pass from the oldest record again.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Documents handled per collection per run. Kept small: one run is one request. */
const PAGE_SIZE = 50;

interface RetentionState {
  photosCursor?: unknown;
  supportCursor?: unknown;
}

/**
 * The stored cursor: `[orderBy value, document id]`, in field order.
 *
 * A lone timestamp is ambiguous (see the ordering comment in `purgeExpiredPhotos`),
 * and anything that is not a well-formed pair is treated as no cursor rather than
 * trusted: the cost of restarting from the oldest record is one re-scan of a page
 * that has already been handled, while a corrupt cursor used as a position could
 * skip live data.
 */
function asCursorPair(stored: unknown): [unknown, string] | undefined {
  if (!Array.isArray(stored) || stored.length !== 2) return undefined;

  const [, id] = stored;

  return typeof id === "string" && id.length > 0
    ? (stored as [unknown, string])
    : undefined;
}

/** The position of `doc`, in the shape `asCursorPair` reads back. */
function cursorPairOf(
  doc: { id: string; data(): Record<string, unknown> } | undefined
): [unknown, string] | undefined {
  if (!doc) return undefined;

  const ordered = doc.data();
  const value = ordered.deliveredAt ?? ordered.resolvedAt;

  return value === undefined || value === null ? undefined : [value, doc.id];
}

interface PhotoPurgeResult {
  scanned: number;
  cleared: number;
  objectsDeleted: number;
  objectsFailed: number;
  passComplete: boolean;
  nextCursor?: unknown;
}

interface SupportPurgeResult {
  scanned: number;
  ticketsDeleted: number;
  messagesDeleted: number;
  passComplete: boolean;
  nextCursor?: unknown;
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: "Unauthorized.", code: "UNAUTHORIZED" },
    { status: 401, headers: NO_STORE }
  );
}

async function readState(): Promise<RetentionState> {
  const snapshot = await adminDb.collection("system").doc("retention").get();
  return snapshot.exists ? (snapshot.data() as RetentionState) : {};
}

async function purgeExpiredPhotos(
  now: Date,
  cursor: unknown
): Promise<PhotoPurgeResult> {
  const cutoff = retentionCutoff(PHOTO_RETENTION_MONTHS, now);

  // One inequality field, ordered by the same field: uses the automatic
  // single-field index, so this needs no composite index in
  // firestore.indexes.json. Documents without `deliveredAt` are not returned,
  // which is exactly right — nothing is delivered, so no retention clock applies.
  let query = adminDb
    .collection("requests")
    .where("deliveredAt", "<=", cutoff) as FirebaseQuery;

  // firestore-list: internal — one purge page; the cursor loop drains the backlog.
  //
  // `__name__` is the tiebreaker that makes the order total. `deliveredAt` alone is
  // not unique: when a page boundary falls inside a group of documents sharing one
  // timestamp, a value-only cursor (`startAfter(deliveredAt)`) resumes strictly after
  // the whole group and silently skips the rest of it — records past their retention
  // that no later page would return. Ordering by the document id as well, and
  // cursoring on [timestamp, id], positions the next page exactly.
  query = query
    .orderBy("deliveredAt", "asc")
    .orderBy("__name__", "asc")
    // firestore-list: pagination — one page; the cursor loop drains the backlog.
    .limit(PAGE_SIZE);
  const startCursor = asCursorPair(cursor);
  if (startCursor) query = query.startAfter(startCursor[0], startCursor[1]);

  const snapshot = await query.get();

  const result: PhotoPurgeResult = {
    scanned: snapshot.size,
    cleared: 0,
    objectsDeleted: 0,
    objectsFailed: 0,
    passComplete: snapshot.size < PAGE_SIZE,
    // Advance past the last row of this page, not the cursor that started it:
    // storing the incoming cursor would make every full page repeat forever.
    // The pair is what makes that position exact across runs — the timestamp alone
    // is ambiguous, and a DocumentSnapshot cannot be stored in `system/retention`.
    nextCursor: cursorPairOf(snapshot.docs.at(-1)),
  };

  for (const doc of snapshot.docs) {
    const data = doc.data() as { warehouse?: unknown };
    const keys = collectPhotoKeys(data.warehouse);
    if (keys.length === 0) continue;

    const outcome = await deleteR2Objects(keys);
    result.objectsDeleted += outcome.deleted;
    result.objectsFailed += outcome.failed;

    // Clear the pointers only when storage confirmed every delete. Clearing them
    // after a partial failure would strand the objects: nothing would reference
    // them, so no later run could retry.
    if (outcome.failed > 0) continue;

    await doc.ref.update({
      "warehouse.inspectionPhotos": [],
      "warehouse.photos": [],
      "warehouse.shippingLabel": null,
      "retention.photosPurgedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    result.cleared++;
  }

  return result;
}

interface WebhookEventPurgeResult {
  scanned: number;
  deleted: number;
}

/**
 * Delete webhook idempotency markers past their retention.
 *
 * The marker's whole job is deduplication while PayPal might redeliver the
 * event, and that window is about three days — so a marker older than
 * WEBHOOK_EVENT_RETENTION_DAYS can never be consulted again.
 *
 * `claimedAt` is an epoch-millis number written before anything else, so every
 * marker carries it. Firestore's type-aware comparison excludes documents
 * whose `claimedAt` is missing or not a number, which is exactly the
 * "unparseable timestamp" guard the docblock promises: an unreadable date is
 * never matched, so it is never deleted on a guess.
 */
async function purgeExpiredWebhookEvents(now: Date): Promise<WebhookEventPurgeResult> {
  const cutoff = now.getTime() - WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  // One inequality field, no ordering: uses the automatic single-field index,
  // consistent with the project's measured rule in check-firestore-indexes.mjs.
  // Bounded per run rather than cursored: every document returned is eligible
  // for deletion, so a short page just means the backlog is drained.
  const snapshot = await adminDb
    .collection("paypalWebhookEvents")
    .where("claimedAt", "<", cutoff)
    .limit(PAGE_SIZE)
    .get();

  const result: WebhookEventPurgeResult = {
    scanned: snapshot.size,
    deleted: 0,
  };

  for (const doc of snapshot.docs) {
    await doc.ref.delete();
    result.deleted++;
  }

  return result;
}

async function purgeExpiredSupport(
  now: Date,
  cursor: unknown
): Promise<SupportPurgeResult> {
  const cutoff = retentionCutoff(SUPPORT_RETENTION_MONTHS, now);

  // Range on `resolvedAt`, so open tickets (no resolvedAt) never match. The
  // status check below is belt-and-braces: a ticket that was reopened keeps its
  // old resolvedAt, and its messages are evidence until it is resolved again.
  let query = adminDb
    .collection("supportTickets")
    .where("resolvedAt", "<=", cutoff) as FirebaseQuery;

  // firestore-list: internal — one purge page; the cursor loop drains the backlog.
  // Same tiebreaker as the photo scan: `resolvedAt` is not unique either.
  query = query
    .orderBy("resolvedAt", "asc")
    .orderBy("__name__", "asc")
    // firestore-list: pagination — one page; the cursor loop drains the backlog.
    .limit(PAGE_SIZE);
  const startCursor = asCursorPair(cursor);
  if (startCursor) query = query.startAfter(startCursor[0], startCursor[1]);

  const snapshot = await query.get();

  const result: SupportPurgeResult = {
    scanned: snapshot.size,
    ticketsDeleted: 0,
    messagesDeleted: 0,
    passComplete: snapshot.size < PAGE_SIZE,
    nextCursor: cursorPairOf(snapshot.docs.at(-1)),
  };

  for (const doc of snapshot.docs) {
    const data = doc.data() as { status?: string; resolvedAt?: unknown };
    if (data.status !== "resolved") continue;
    if (!isPastRetention(data.resolvedAt, SUPPORT_RETENTION_MONTHS, now))
      continue;

    const messages = await adminDb
      .collection("supportMessages")
      .where("ticketId", "==", doc.id)
      .get();

    for (const message of messages.docs) {
      await message.ref.delete();
      result.messagesDeleted++;
    }

    await doc.ref.delete();
    result.ticketsDeleted++;
  }

  return result;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "[Cron] CRON_SECRET not configured; retention purge refused."
    );
    return NextResponse.json(
      { success: false, error: "Cron not configured.", code: "CONFIG_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }

  if (!(await verifyCronRequest(request, cronSecret))) return unauthorized();

  const now = new Date();
  const state = await readState();

  const photos = await purgeExpiredPhotos(now, state.photosCursor);
  const support = await purgeExpiredSupport(now, state.supportCursor);
  const webhookEvents = await purgeExpiredWebhookEvents(now);

  // Abandoned checkouts whose customer never came back would otherwise hold
  // their reservation until that customer's next checkout, which may be never.
  // Best effort like the cleanup it wraps: a failure here must not fail the
  // whole purge run.
  let holdsReleased = 0;
  let holdsFailed = false;
  try {
    holdsReleased = await releaseExpiredWalletHolds(now);
  } catch {
    holdsFailed = true;
  }

  await adminDb
    .collection("system")
    .doc("retention")
    .set(
      {
        photosCursor: photos.passComplete
          ? FieldValue.delete()
          : (photos.nextCursor ?? null),
        supportCursor: support.passComplete
          ? FieldValue.delete()
          : (support.nextCursor ?? null),
        lastRunAt: FieldValue.serverTimestamp(),
        lastRun: { photos, support, webhookEvents, holdsReleased },
      },
      { merge: true }
    );

  return NextResponse.json(
    {
      success: true,
      photos,
      support,
      webhookEvents,
      holdsReleased,
      ...(holdsFailed ? { warning: "The wallet-hold release sweep failed; expired holds remain reserved until the next run." } : {}),
      timestamp: now.toISOString(),
    },
    { status: 200, headers: NO_STORE }
  );
});

/**
 * Minimal shape of the fluent Firestore query used above, so the two `as` casts
 * stay honest without importing the admin SDK's full generic types.
 */
interface FirebaseQuery {
  where(field: string, op: string, value: unknown): FirebaseQuery;
  orderBy(field: string, direction: "asc" | "desc"): FirebaseQuery;
  limit(count: number): FirebaseQuery;
  startAfter(...values: unknown[]): FirebaseQuery;
  get(): Promise<{
    size: number;
    docs: Array<{
      id: string;
      data(): Record<string, unknown>;
      ref: { update(v: object): Promise<unknown>; delete(): Promise<unknown> };
    }>;
  }>;
}
