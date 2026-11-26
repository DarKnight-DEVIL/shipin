/**
 * `POST /api/admin/wallet/invariants` — nightly wallet ledger invariant sweep.
 *
 * Three properties are checked for every wallet, read-only:
 *
 *   - `balance` equals the sum of that user's `walletTransactions.amount`;
 *   - `reserved` equals the sum of that user's active (status `reserved`)
 *     `walletHolds.amount`;
 *   - `balance` is not negative.
 *
 * Every wallet mutation in the app writes a ledger entry in the same Firestore
 * transaction (top-up, wallet payment, PayPal settlement, admin credit/refund,
 * partial refund), which is what makes the first property meaningful. The
 * exception is erasure: `/api/user/erase` deletes the user's ledger rows by
 * design and leaves the wallet document, so a post-erasure wallet with a
 * balance is reported as drift. That is a real unbacked balance for a human to
 * resolve, not a false positive to suppress.
 *
 * Like the payment reconciler, this job repairs nothing. A mismatch means the
 * ledger and the balance disagree, and the right fix differs per case, so it
 * answers 409 and stores its verdict at `system/walletInvariants` for the
 * scheduled run to alert on.
 *
 * The sweep reads each collection to EXHAUSTION in document-id order. It used to
 * stop at a fixed number of pages, which made the failure it exists to catch
 * invisible exactly when the data grew: past the cap it stopped comparing and
 * reported `WALLET_SWEEP_TRUNCATED` every night, forever, while real drift sat
 * unreported. Two limits remain, and neither can silently hide drift:
 *
 *   - a wall-clock budget shared by the whole sweep, because a function has to
 *     return before the platform kills it;
 *   - a document cap far above any real deployment, as a runaway guard.
 *
 * Hitting either is reported with the collection, what stopped it and how much was
 * read, so the next step is a knob to turn rather than an unexplained 409. A partial
 * scan is never compared: an incomplete ledger sum would mark every wallet wrong.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldPath, type DocumentSnapshot } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sameMinorCents } from "@/lib/paypal/amounts";
import { storedMinor, toDecimal } from "@/lib/money";
import { withErrorHandler } from "@/utils/errors";

const PAGE_SIZE = 200;

/**
 * Wall-clock budget for the whole sweep, shared by the three scans.
 *
 * Set below `maxDuration` so the route returns its own 409 instead of being killed
 * mid-scan with no body. Raise it together with `maxDuration` if a deployment's
 * ledger outgrows it; the response names this variable when it runs out.
 */
const DEFAULT_BUDGET_MS = 25_000;
const BUDGET_ENV = "WALLET_SWEEP_BUDGET_MS";

/**
 * Runaway guard, not a capacity limit: 200,000 documents per collection at 200 per
 * page is 1,000 round trips, which the budget stops long before. Reaching it means a
 * collection is far outside anything this app writes.
 */
const MAX_DOCS_PER_COLLECTION = 200_000;

/** Mismatches stored in `system/walletInvariants` (the response carries all). */
const MAX_STORED_DRIFT = 100;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Bigger than DEFAULT_BUDGET_MS on purpose: a function killed by the platform
 * returns no body at all, which the cron workflow can only report as a transport
 * failure. This route always answers for itself.
 */
export const maxDuration = 60;

type WalletDriftKind =
  | "wallet_negative_balance"
  | "wallet_balance_mismatch"
  | "wallet_reserved_mismatch"
  | "wallet_hold_expired";

interface WalletDrift {
  kind: WalletDriftKind;
  walletId: string;
  detail: string;
  /** Carried from an earlier run so an open case shows its age. */
  firstSeenAt?: Date;
}

interface Scan {
  docs: DocumentSnapshot[];
  /** Null when the collection was read to the end. */
  truncation: { reason: string; docsRead: number } | null;
}

function sweepBudgetMs(): number {
  const configured = Number(process.env[BUDGET_ENV]);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_BUDGET_MS;
}

/**
 * Read a collection in document-id order, page by page.
 *
 * Document-id ordering uses Firestore's built-in index, so no composite index
 * is needed and no document is skipped for lacking a timestamp field. The
 * cursor is the last snapshot, which works for `__name__` ordering.
 */
async function scanCollection(
  collection: string,
  deadline: number
): Promise<Scan> {
  const docs: DocumentSnapshot[] = [];
  let cursor: DocumentSnapshot | undefined;

  for (;;) {
    if (docs.length >= MAX_DOCS_PER_COLLECTION) {
      return {
        docs,
        truncation: {
          reason: `document cap (${MAX_DOCS_PER_COLLECTION}) reached`,
          docsRead: docs.length,
        },
      };
    }

    if (Date.now() >= deadline) {
      return {
        docs,
        truncation: {
          reason: `time budget (${sweepBudgetMs()}ms, ${BUDGET_ENV}) spent`,
          docsRead: docs.length,
        },
      };
    }

    const query = adminDb
      .collection(collection)
      .orderBy(FieldPath.documentId())
      // firestore-list: internal — reads until the collection ends; see Scan.
      .limit(PAGE_SIZE);

    const snapshot = await (cursor ? query.startAfter(cursor) : query).get();
    docs.push(...snapshot.docs);

    // A short page is the end of the collection. This is the only normal exit.
    if (snapshot.size < PAGE_SIZE) return { docs, truncation: null };

    // A full page is non-empty, so there is always a last document to cursor
    // from. Casting keeps this from becoming an unreachable branch.
    cursor = snapshot.docs.at(-1) as DocumentSnapshot;
  }
}

/** Unix-ms, ISO string or Firestore Timestamp → Date. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === "function") {
      const converted = toDate.call(value);
      return converted instanceof Date ? converted : null;
    }
  }
  return null;
}

/** First-seen ages from the previous verdict, keyed by kind + wallet. */
function previousFirstSeen(value: unknown): Map<string, Date> {
  const seen = new Map<string, Date>();
  if (!Array.isArray(value)) return seen;

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.kind !== "string" ||
      typeof record.walletId !== "string"
    ) {
      continue;
    }
    const date = asDate(record.firstSeenAt);
    if (date) seen.set(`${record.kind}|${record.walletId}`, date);
  }

  return seen;
}

/**
 * Sum an amount field per user, ignoring rows without a usable owner.
 *
 * Summed in integer minor units so a long ledger cannot accumulate a float
 * tail, and so the comparison against a wallet balance is exact (ADR-0008).
 * `storedMinor` reads either representation, so a row written before the
 * backfill still counts.
 */
function sumByUser(
  docs: DocumentSnapshot[],
  include: (doc: DocumentSnapshot) => boolean = () => true
): { totals: Map<string, number>; matched: number } {
  const totals = new Map<string, number>();
  let matched = 0;

  for (const doc of docs) {
    if (!include(doc)) continue;

    const userId = doc.get("userId");
    if (typeof userId !== "string" || !userId) continue;

    const amountMinor = storedMinor(doc.data(), "amount");
    totals.set(userId, (totals.get(userId) ?? 0) + amountMinor);
    matched += 1;
  }

  return { totals, matched };
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured; wallet sweep refused.");
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

  const now = new Date();

  const deadline = Date.now() + sweepBudgetMs();

  const [wallets, ledger, holds] = await Promise.all([
    scanCollection("wallets", deadline),
    scanCollection("walletTransactions", deadline),
    scanCollection("walletHolds", deadline),
  ]);

  const truncated = Boolean(
    wallets.truncation || ledger.truncation || holds.truncation
  );

  // Named per collection: "the sweep was truncated" told an operator nothing about
  // which knob to turn or how close the data is to the limit.
  const truncation = {
    ...(wallets.truncation ? { wallets: wallets.truncation } : {}),
    ...(ledger.truncation ? { walletTransactions: ledger.truncation } : {}),
    ...(holds.truncation ? { walletHolds: holds.truncation } : {}),
  };

  const ledgerTotals = sumByUser(ledger.docs);
  const activeHolds = sumByUser(
    holds.docs,
    (doc) => doc.get("status") === "reserved"
  );

  const previousRun = await adminDb
    .collection("system")
    .doc("walletInvariants")
    .get();
  const firstSeen = previousFirstSeen(
    previousRun.exists ? previousRun.get("drift") : undefined
  );

  const drift: WalletDrift[] = [];

  /*
   * A truncated ledger or hold scan has an incomplete sum, so every balance
   * would look wrong. Report the incompleteness instead of inventing cases.
   */
  if (!truncated) {
    for (const wallet of wallets.docs) {
      const balanceMinor = storedMinor(wallet.data(), "balance");
      const reservedMinor = storedMinor(wallet.data(), "reserved");
      const expectedBalanceMinor = ledgerTotals.totals.get(wallet.id) ?? 0;
      const expectedReservedMinor = activeHolds.totals.get(wallet.id) ?? 0;
      const balance = toDecimal(balanceMinor);
      const reserved = toDecimal(reservedMinor);
      const expectedBalance = toDecimal(expectedBalanceMinor);
      const expectedReserved = toDecimal(expectedReservedMinor);

      const cases: Array<{ kind: WalletDriftKind; detail: string }> = [];

      if (balance < 0) {
        cases.push({
          kind: "wallet_negative_balance",
          detail: `wallet balance is ${balance.toFixed(2)}; it must never go below zero`,
        });
      }

      if (!sameMinorCents(balanceMinor, expectedBalanceMinor)) {
        cases.push({
          kind: "wallet_balance_mismatch",
          detail: `wallet balance is ${balance.toFixed(2)} but its ledger sums to ${expectedBalance.toFixed(2)}`,
        });
      }

      if (!sameMinorCents(reservedMinor, expectedReservedMinor)) {
        cases.push({
          kind: "wallet_reserved_mismatch",
          detail: `wallet reserved is ${reserved.toFixed(2)} but active holds sum to ${expectedReserved.toFixed(2)}`,
        });
      }

      for (const walletCase of cases) {
        const seen = firstSeen.get(`${walletCase.kind}|${wallet.id}`);
        drift.push({
          ...walletCase,
          walletId: wallet.id,
          ...(seen ? { firstSeenAt: seen } : {}),
        });
      }
    }

    /*
     * A stale reservation still balances against its hold, so the reserved
     * equality check above cannot see it. Flag the hold itself: an abandoned
     * checkout must be released rather than holding a customer's money forever.
     */
    for (const hold of holds.docs) {
      if (hold.get("status") !== "reserved") continue;
      const expiresAt = asDate(hold.get("expiresAt"));
      if (!expiresAt || expiresAt.getTime() > now.getTime()) continue;

      const userId = hold.get("userId");
      if (typeof userId !== "string" || !userId) continue;

      const seen = firstSeen.get(`wallet_hold_expired|${hold.id}`);
      drift.push({
        kind: "wallet_hold_expired",
        walletId: userId,
        detail: `wallet hold ${hold.id} expired at ${expiresAt.toISOString()} but is still reserved`,
        ...(seen ? { firstSeenAt: seen } : {}),
      });
    }
  }

  const checked = {
    wallets: wallets.docs.length,
    ledgerEntries: ledger.docs.length,
    activeHolds: activeHolds.matched,
    holds: holds.docs.length,
  };

  await adminDb
    .collection("system")
    .doc("walletInvariants")
    .set({
      lastRunAt: now,
      checked,
      driftCount: drift.length,
      drift: truncated
        ? (previousRun.get("drift") ?? []).slice(0, MAX_STORED_DRIFT)
        : drift.slice(0, MAX_STORED_DRIFT),
      driftTruncated: truncated
        ? Boolean(previousRun.get("driftTruncated"))
        : drift.length > MAX_STORED_DRIFT,
      truncated,
      truncation,
    });

  for (const entry of drift) {
    console.error("[wallet-invariants] drift:", entry);
  }

  const body = {
    success: drift.length === 0 && !truncated,
    code: truncated
      ? "WALLET_SWEEP_TRUNCATED"
      : drift.length > 0
        ? "WALLET_INVARIANT_DRIFT"
        : undefined,
    checked,
    drift,
    driftTruncated: drift.length > MAX_STORED_DRIFT,
    truncated,
    ...(truncated ? { truncation } : {}),
    scannedAt: now.toISOString(),
  };

  return NextResponse.json(body, {
    // 409, not 200: the scheduled run has to go red for anyone to look.
    status: drift.length === 0 && !truncated ? 200 : 409,
    headers: NO_STORE,
  });
});
