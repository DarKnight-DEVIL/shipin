/**
 * `POST /api/admin/payments/reconcile` — daily PayPal ↔ Firestore reconciliation.
 *
 * Money reaches a request by two independent paths:
 *
 *   - the PayPal webhook (`PAYMENT.CAPTURE.COMPLETED`), which marks the order
 *     `completed` in `paypalPaymentOrders` and moves the request itself, and
 *   - the browser's `capture-order` call, which settles after PayPal confirms.
 *
 * Each path is idempotent against its own record, so either can succeed while
 * the other never runs. The dangerous shape is a completed order whose request
 * never learned about it (webhook marked `completed`, settlement path failed
 * silently): the customer was charged and support finds out only when they
 * complain. The mirror case — a request that believes it is paid against an
 * order that never completed — hides a charge that does not exist.
 *
 * This job compares both directions and reports. It deliberately does NOT
 * repair anything: a mismatch means money and state disagree, and the right fix
 * differs per case (replay the settlement, refund the capture, correct a manual
 * edit), so an automatic write here could turn a reporting bug into a money
 * bug. Drift answers 409, which makes `curl --fail-with-body` fail the
 * scheduled GitHub run so the existing cron alert fires instead of a green run
 * carrying a detail nobody opens.
 *
 * Neither side is compared on `requests.status`: that field advances past
 * "paid" on its normal lifecycle (warehouse → shipped → delivered), so the
 * question is always "does the request carry a completed payment for this
 * order", never "is the request still standing at paid".
 *
 * Two lifecycle events deliberately do NOT change what is compared, because the
 * payment record outlives both:
 *
 *   - erasure (`/api/user/erase`) anonymises a request in place — email,
 *     customer name, shipping address — and keeps `payment`, so the pair still
 *     matches. A cascade that dropped `payment` would make every erased
 *     customer permanent drift; `erase/route.test.ts` pins that it does not.
 *   - an admin refund writes `refundRequest.*` and `requests.status =
 *     "refunded"`, while the capture stays `completed` at PayPal (the
 *     `PAYMENT.CAPTURE.REFUNDED` webhook is acknowledged and not processed), so
 *     the order still settles the request. Because of that, a refund made
 *     directly in the PayPal dashboard is invisible here: this job reports
  * accepted charges that were never reflected, not refunds that were.
 *
 * Wallet top-ups are a third path with the same failure shape: the capture
 * route writes `walletTopupOrders/{id}.capturePending` before calling PayPal,
 * and the credit lands in `walletTransactions/{captureId}` in one transaction.
 * A crash between them leaves a charged customer, a flag no other code reads,
 * and no ledger entry. This job therefore also reports a stale pending capture
 * and a completed top-up whose credit is missing. `requestId` is empty for
 * those cases; the top-up order id keys them.
 */

import { NextRequest, NextResponse } from "next/server";
import type { DocumentSnapshot, Query } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyCronRequest } from "@/lib/cronAuth";
import { captureServerError } from "@/lib/errorTracking";
import { withErrorHandler } from "@/utils/errors";

/**
 * Days of history each run compares.
 *
 * Daily cadence plus a week of overlap: a payment that was mid-flight when a
 * run started is covered by the next six, and a single skipped or delayed
 * scheduled run does not leave a blind spot. Scheduled jobs on GitHub are
 * best-effort, so the window is the retry story.
 *
 * The window bounds the *scan*, not the life of a finding. A pair reported once
 * and not fixed used to fall out of the window and stop being reported, which
 * turned an open money problem green after seven days; open cases are now
 * carried forward (`carriedDrift` / `recheckOpenCase`) and re-derived from the
 * documents on every run until they are settled.
 */
const DEFAULT_WINDOW_DAYS = 7;

/** Upper bound for the `?days=` override, so one request cannot sweep years. */
const MAX_WINDOW_DAYS = 90;

const PAGE_SIZE = 200;

/** Ten pages is 2,000 settlements per side per run; more reports `truncated`. */
const MAX_PAGES = 10;

/** Mismatches stored in `system/paymentReconciliation` (the response carries all). */
const MAX_STORED_DRIFT = 50;

/** A capture still pending after this long needs a human, not more retries. */
const STALE_CAPTURE_PENDING_MS = 30 * 60 * 1000;

const NO_STORE = { "Cache-Control": "no-store" } as const;

type DriftKind =
  | "order_completed_request_missing"
  | "order_completed_request_not_settled"
  | "order_completed_addon_not_settled"
  | "order_without_request"
  | "request_paid_order_missing"
  | "request_paid_order_not_completed"
  | "topup_capture_pending_uncredited"
  | "topup_completed_uncredited"
  | "topup_completed_unverifiable";

interface Drift {
  kind: DriftKind;
  orderId: string;
  requestId: string;
  detail: string;
  /**
   * When this pair was first reported. Carried forward across runs so an open
   * case shows its age instead of looking brand new each morning.
   */
  firstSeenAt?: Date | string;
}

interface Scan {
  rows: Array<{ id: string; snapshot: DocumentSnapshot }>;
  truncated: boolean;
}

/** Unix-ms or ISO string → Date, for the field a query is ordered by. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === "function") {
      const converted = toDate.call(value);
      return converted instanceof Date ? converted : null;
    }
  }
  return null;
}

/**
 * Reads one side of the comparison, page by page.
 *
 * `build` is written out per collection below rather than parameterised by
 * field name. `check-firestore-indexes` reads string literals, so a `where`
 * whose field arrives as a variable is reported as unverified — and an
 * unverified payment query is exactly the kind that ships, then fails with
 * FAILED_PRECONDITION while the index gate stays green.
 */
async function pageThrough(
  build: () => Query,
  cursorField: "completedAt" | "payment.paidAt"
): Promise<Scan> {
  const rows: Scan["rows"] = [];
  let cursor: unknown;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    // firestore-list: internal — bounded scan; a full last page sets
    // scan.truncated, which the report carries.
    let query = build().limit(PAGE_SIZE);
    if (cursor !== undefined) query = query.startAfter(cursor);

    const snapshot = await query.get();
    for (const doc of snapshot.docs) rows.push({ id: doc.id, snapshot: doc });

    if (snapshot.size < PAGE_SIZE) return { rows, truncated: false };

    const last = snapshot.docs.at(-1)?.get(cursorField);
    if (last === undefined) return { rows, truncated: false };
    cursor = last;

    if (page === MAX_PAGES - 1) return { rows, truncated: true };
  }

  return { rows, truncated: true };
}

/** Captures PayPal completed inside the window, oldest first. */
function scanCompletedOrders(cutoff: Date): Promise<Scan> {
  return pageThrough(
    () =>
      adminDb
        .collection("paypalPaymentOrders")
        .where("status", "==", "completed")
        .where("completedAt", ">=", cutoff)
        .orderBy("completedAt", "asc"),
    "completedAt"
  );
}

/** Requests carrying a PayPal payment inside the window, oldest first. */
function scanPaidRequests(cutoff: Date): Promise<Scan> {
  return pageThrough(
    () =>
      adminDb
        .collection("requests")
        .where("payment.paidAt", ">=", cutoff)
        .orderBy("payment.paidAt", "asc"),
    "payment.paidAt"
  );
}

/** Captures of wallet top-ups completed inside the window, oldest first. */
function scanCompletedTopups(cutoff: Date): Promise<Scan> {
  return pageThrough(
    () =>
      adminDb
        .collection("walletTopupOrders")
        // Range and order on the same field: the automatic single-field index,
        // so the daily scan needs no composite entry in firestore.indexes.json.
        .where("completedAt", ">=", cutoff)
        .orderBy("completedAt", "asc"),
    "completedAt"
  );
}

/**
 * Orders whose capture never reported back.
 *
 * Deliberately no date range in the query: `capturePending == true` is small by
 * construction (one row per in-flight checkout), and a range on a second field
 * would need a composite index. Age is judged below instead.
 */
async function scanPendingTopups(): Promise<Scan> {
  const snapshot = await adminDb
    .collection("walletTopupOrders")
    .where("capturePending", "==", true)
    // firestore-list: internal — in-flight checkouts only; stale ones are reported.
    .limit(PAGE_SIZE)
    .get();

  return {
    rows: snapshot.docs.map((doc) => ({ id: doc.id, snapshot: doc })),
    truncated: snapshot.size === PAGE_SIZE,
  };
}

/**
 * Whether the credit a top-up writes exists.
 *
 * The (now removed) top-up route used the raw capture id as the ledger document
 * id, while request settlements write `paypal_<captureId>`. Orders created back
 * then are still reconciled here, so the raw id remains the correct lookup for
 * them - checking the other convention would report every healthy top-up as
 * missing.
 */
async function topupCreditExists(captureId: string): Promise<boolean> {
  if (!captureId) return false;

  const snapshot = await adminDb
    .collection("walletTransactions")
    .doc(captureId)
    .get();

  return snapshot.exists;
}

/**
 * Report a top-up whose charge and credit disagree.
 *
 * Three shapes matter: a capture that has been "in flight" long past any
 * plausible PayPal call, a completed order with no ledger entry, and a
 * completed order with no capture id to check. The first is the one that hides
 * a charged customer: the flag is the only trace, and nothing else reads it.
 */
async function inspectTopupOrder(
  orderId: string,
  snapshot: DocumentSnapshot,
  drift: Drift[],
  now: Date
): Promise<void> {
  const capturePending = snapshot.get("capturePending") === true;
  const captureId =
    typeof snapshot.get("captureId") === "string"
      ? (snapshot.get("captureId") as string)
      : "";
  const startedAt = asDate(snapshot.get("captureStartedAt"));
  const completedAt = asDate(snapshot.get("completedAt"));

  if (capturePending) {
    // A recent flag is a capture still in progress, not drift: PayPal can take
    // seconds and the route clears the flag in the credit transaction.
    if (
      startedAt &&
      now.getTime() - startedAt.getTime() < STALE_CAPTURE_PENDING_MS
    ) {
      return;
    }

    const since = startedAt ? startedAt.toISOString() : "an unrecorded time";
    const credited = await topupCreditExists(captureId);

    drift.push({
      kind: "topup_capture_pending_uncredited",
      orderId,
      requestId: "",
      detail: captureId
        ? credited
          ? `wallet top-up ${orderId} is still capturePending since ${since}, but its credit ${captureId} exists and the order was never marked complete`
          : `wallet top-up ${orderId} has been capturePending since ${since} with no credit for ${captureId}; the capture may have succeeded at PayPal`
        : `wallet top-up ${orderId} has been capturePending since ${since} with no captureId, so it cannot be reconciled from Firestore`,
    });
    return;
  }

  if (snapshot.get("status") !== "completed") return;

  if (!captureId) {
    drift.push({
      kind: "topup_completed_unverifiable",
      orderId,
      requestId: "",
      detail: `wallet top-up ${orderId} is completed but has no captureId, so its credit cannot be verified`,
    });
    return;
  }

  if (!(await topupCreditExists(captureId))) {
    drift.push({
      kind: "topup_completed_uncredited",
      orderId,
      requestId: "",
      detail: `wallet top-up ${orderId} completed${
        completedAt ? ` at ${completedAt.toISOString()}` : ""
      } but has no walletTransactions/${captureId} credit`,
    });
  }
}

/** Wallet-only payments have no PayPal order and nothing to compare. */
function isPayPalSettled(payment: unknown): boolean {
  if (typeof payment !== "object" || payment === null) return false;
  const record = payment as Record<string, unknown>;
  return (
    typeof record.orderId === "string" &&
    record.orderId.length > 0 &&
    record.status === "completed"
  );
}

/**
 * Direction 1 — the money exists at PayPal, the request disagrees.
 *
 * A completed order must be reflected on its request: as the main payment for
 * `paymentType: "main"`, or as a settled `additionalPayments` entry for an
 * add-on. Anything else is a customer charged for a shipment the app still
 * thinks is unpaid.
 */
async function inspectCompletedOrder(
  orderId: string,
  snapshot: DocumentSnapshot,
  drift: Drift[]
): Promise<void> {
  const requestId = snapshot.get("requestId") as string | undefined;

  if (!requestId) {
    drift.push({
      kind: "order_without_request",
      orderId,
      requestId: "",
      detail: "completed PayPal order has no requestId, so nothing can be settled",
    });
    return;
  }

  const requestSnapshot = await adminDb.collection("requests").doc(requestId).get();

  if (!requestSnapshot.exists) {
    drift.push({
      kind: "order_completed_request_missing",
      orderId,
      requestId,
      detail: "completed PayPal order points at a request that does not exist",
    });
    return;
  }

  const paymentType = snapshot.get("paymentType") as string | undefined;
  const captureId = (snapshot.get("captureId") as string | undefined) ?? "";

  if (paymentType === "additional_item") {
    const additionalItemRequestId = snapshot.get(
      "additionalItemRequestId"
    ) as string | undefined;

    const payments = requestSnapshot.get("additionalPayments");
    const settled =
      Array.isArray(payments) &&
      payments.some((entry) => {
        if (typeof entry !== "object" || entry === null) return false;
        const record = entry as Record<string, unknown>;
        return (
          record.additionalItemRequestId === additionalItemRequestId &&
          record.status === "completed"
        );
      });

    if (!settled) {
      drift.push({
        kind: "order_completed_addon_not_settled",
        orderId,
        requestId,
        detail: `add-on ${additionalItemRequestId ?? "(unknown)"} was captured but the request has no completed entry for it`,
      });
    }
    return;
  }

  const payment = requestSnapshot.get("payment");
  const settled =
    isPayPalSettled(payment) &&
    (payment as Record<string, unknown>).orderId === orderId;

  if (!settled) {
    const observed =
      typeof payment === "object" && payment !== null
        ? `payment.orderId=${String(
            (payment as Record<string, unknown>).orderId ?? "unset"
          )}, status=${String(
            (payment as Record<string, unknown>).status ?? "unset"
          )}`
        : "no payment block";

    drift.push({
      kind: "order_completed_request_not_settled",
      orderId,
      requestId,
      detail: `captured ${captureId || "order"} is not reflected on the request (${observed})`,
    });
  }
}

/**
 * Direction 2 — the request believes it is paid, the order disagrees.
 *
 * Every request carrying `payment.paidAt` should have a completed order behind
 * it. The order document is read by id, so this direction costs one read per
 * PayPal-paid request in the window, not a query.
 */
async function inspectPaidRequest(
  requestId: string,
  snapshot: DocumentSnapshot,
  drift: Drift[]
): Promise<void> {
  const payment = snapshot.get("payment");
  if (typeof payment !== "object" || payment === null) return;

  const record = payment as Record<string, unknown>;
  const orderId = typeof record.orderId === "string" ? record.orderId : "";

  // Fully wallet-funded: there is no PayPal order to compare against. The
  // wallet writer stores the sentinel `orderId: "wallet"` (truthy), so the
  // provider check has to come first — an orderId-only guard would send every
  // wallet payment into a lookup of paypalPaymentOrders/wallet and report it
  // as request_paid_order_missing.
  const isWalletPayment =
    record.provider === "wallet" || record.paymentMethod === "wallet";
  if (isWalletPayment || !orderId) return;

  const orderSnapshot = await adminDb
    .collection("paypalPaymentOrders")
    .doc(orderId)
    .get();

  if (!orderSnapshot.exists) {
    drift.push({
      kind: "request_paid_order_missing",
      orderId,
      requestId,
      detail: "request records a PayPal payment for an order that was never stored",
    });
    return;
  }

  const status = orderSnapshot.get("status") as string | undefined;
  if (status !== "completed") {
    drift.push({
      kind: "request_paid_order_not_completed",
      orderId,
      requestId,
      detail: `request is paid but the PayPal order is "${status ?? "unset"}"`,
    });
  }
}

/** Identity of one open case: the same pair may change kind as it evolves. */
function driftKey(entry: Pick<Drift, "orderId" | "requestId">): string {
  return `${entry.orderId}|${entry.requestId}`;
}

/**
 * Re-derives the verdict for an open case from the documents as they are now.
 *
 * The carried entry is a *pointer*, never evidence: both sides are inspected
 * again with the same functions the window scan uses, so a fixed pair drops out
 * and a pair that changed shape (request restored but still unsettled) reports
 * its current kind. Reads only — this job still repairs nothing.
 */
async function recheckOpenCase(entry: Drift, now: Date): Promise<Drift[]> {
  const fresh: Drift[] = [];

  // Top-up cases live in their own collection and have no request pair to
  // re-derive from; re-inspecting the order is the whole recheck.
  if (entry.kind.startsWith("topup_")) {
    if (!entry.orderId) return fresh;

    const snapshot = await adminDb
      .collection("walletTopupOrders")
      .doc(entry.orderId)
      .get();

    if (snapshot.exists) {
      await inspectTopupOrder(entry.orderId, snapshot, fresh, now);
    }

    return fresh;
  }

  if (entry.orderId) {
    const orderSnapshot = await adminDb
      .collection("paypalPaymentOrders")
      .doc(entry.orderId)
      .get();
    if (orderSnapshot.exists) {
      await inspectCompletedOrder(entry.orderId, orderSnapshot, fresh);
    }
  }

  if (entry.requestId) {
    const requestSnapshot = await adminDb
      .collection("requests")
      .doc(entry.requestId)
      .get();
    if (requestSnapshot.exists) {
      await inspectPaidRequest(entry.requestId, requestSnapshot, fresh);
    }
  }

  return fresh;
}

/** Open cases from the previous run, defensively parsed. */
function carriedDrift(value: unknown): Drift[] {
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is Drift => {
    if (typeof entry !== "object" || entry === null) return false;
    const record = entry as Record<string, unknown>;
    return (
      typeof record.kind === "string" &&
      typeof record.orderId === "string" &&
      typeof record.requestId === "string"
    );
  });
}

function windowDays(url: URL): number {
  const raw = url.searchParams.get("days");
  if (raw === null) return DEFAULT_WINDOW_DAYS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WINDOW_DAYS;

  return Math.min(parsed, MAX_WINDOW_DAYS);
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured; payment reconciliation refused.");
    return NextResponse.json(
      { success: false, error: "Cron not configured.", code: "CONFIG_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }

  if (!(await verifyCronRequest(request, cronSecret))) {
    return NextResponse.json(
      { success: false, error: "Unauthorized.", code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE }
    );
  }

  const days = windowDays(request.nextUrl);
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const orders = await scanCompletedOrders(cutoff);
  const paidRequests = await scanPaidRequests(cutoff);
  const completedTopups = await scanCompletedTopups(cutoff);
  const pendingTopups = await scanPendingTopups();

  const drift: Drift[] = [];

  for (const { id, snapshot } of orders.rows) {
    await inspectCompletedOrder(id, snapshot, drift);
  }

  for (const { id, snapshot } of paidRequests.rows) {
    await inspectPaidRequest(id, snapshot, drift);
  }

  for (const { id, snapshot } of completedTopups.rows) {
    await inspectTopupOrder(id, snapshot, drift, now);
  }

  for (const { id, snapshot } of pendingTopups.rows) {
    await inspectTopupOrder(id, snapshot, drift, now);
  }

  const truncated =
    orders.truncated ||
    paidRequests.truncated ||
    completedTopups.truncated ||
    pendingTopups.truncated;

  const statusRef = adminDb.collection("system").doc("paymentReconciliation");
  const previousRun = await statusRef.get();
  // Validate before touching any field: a malformed entry used to be spread
  // and read first, so one null in the stored array made every run answer 500.
  const openCases = carriedDrift(
    previousRun.exists ? previousRun.get("drift") : undefined
  ).map((entry) => ({
    ...entry,
    // Normalize firstSeenAt to Date (Firestore returns Timestamp).
    firstSeenAt: asDate(entry.firstSeenAt) ?? undefined,
  }));

  // A window is a scan, not a lifetime. Drift that was reported once and never
  // fixed used to disappear when it left the window, so the next runs went
  // green without anyone resolving it. Open cases are therefore re-checked on
  // every run, from the current documents, and stay in the report until they
  // are actually settled.
  const reported = new Map<string, Drift>();
  for (const entry of drift) reported.set(driftKey(entry), entry);

  let carriedForward = 0;

  for (const open of openCases) {
    const key = driftKey(open);
    if (reported.has(key)) {
      // Re-detected by this run's scan; keep the age it was first seen.
      const found = reported.get(key) as Drift;
      if (open.firstSeenAt) found.firstSeenAt = open.firstSeenAt;
      continue;
    }

    for (const current of await recheckOpenCase(open, now)) {
      const currentKey = driftKey(current);
      if (reported.has(currentKey)) continue;

      reported.set(currentKey, {
        ...current,
        firstSeenAt: open.firstSeenAt ?? now,
      });
      carriedForward += 1;
    }
  }

  const driftNow = [...reported.values()].map((entry) => ({
    ...entry,
    firstSeenAt: entry.firstSeenAt ?? now,
  }));

  // Kept in Firestore as well, so the last verdict is readable without the
  // GitHub run history (which is pruned) and a dashboard can chart it later.
  await statusRef.set({
    lastRunAt: now,
    windowDays: days,
    cutoff,
    checked: {
      completedOrders: orders.rows.length,
      paypalPaidRequests: paidRequests.rows.length,
      completedTopups: completedTopups.rows.length,
      pendingTopups: pendingTopups.rows.length,
    },
    driftCount: driftNow.length,
    carriedForward,
    // Only the stored copy is capped (the response carries all of them), but a
    // capped store means carried cases could rotate out on a later run, so the
    // flag has to travel with the verdict.
    driftTruncated: driftNow.length > MAX_STORED_DRIFT,
    drift: driftNow.slice(0, MAX_STORED_DRIFT),
    truncated,
  });

  if (driftNow.length > 0) {
    // Drift means money and state disagree: the customer was charged for
    // something the app does not show. One structured event per run, carrying the
    // counts and the first entries, so the operator channel has the shape of the
    // problem without a log viewer.
    await captureServerError(
      new Error(
        `${driftNow.length} payment(s) disagree between PayPal and Firestore in the last ${days} day(s).`
      ),
      {
        category: "payment-drift",
        severity: "critical",
        code: "PAYMENT_DRIFT",
        // The counts identify the incident; the entries vary per run, and using
        // them in the fingerprint would page once per distinct order.
        fingerprint: "payment-drift:reconcile",
        context: {
          driftCount: driftNow.length,
          carriedForward,
          windowDays: days,
          firstCases: driftNow.slice(0, 5).map((entry) => entry.kind),
        },
      }
    );
  }

  const body = {
    success: driftNow.length === 0,
    code: driftNow.length === 0 ? undefined : "PAYMENT_DRIFT",
    windowDays: days,
    checked: {
      completedOrders: orders.rows.length,
      paypalPaidRequests: paidRequests.rows.length,
      completedTopups: completedTopups.rows.length,
      pendingTopups: pendingTopups.rows.length,
    },
    drift: driftNow,
    carriedForward,
    driftTruncated: driftNow.length > MAX_STORED_DRIFT,
    truncated,
    scannedAt: now.toISOString(),
  };

  return NextResponse.json(body, {
    // 409, not 200: the scheduled run has to go red for anyone to look.
    status: driftNow.length === 0 ? 200 : 409,
    headers: NO_STORE,
  });
});
