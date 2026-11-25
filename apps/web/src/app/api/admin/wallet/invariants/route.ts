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
 * The sweep is bounded: every collection is read in document-id order with a
 * fixed page cap. If any scan hits its cap, no comparison is made — a partial
 * ledger sum would invent drift for every wallet — and the run reports
 * `WALLET_SWEEP_TRUNCATED` instead.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  FieldPath,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sameMinorCents } from "@/lib/paypal/amounts";
import { storedMinor, toDecimal } from "@/lib/money";
import { withErrorHandler } from "@/utils/errors";

const PAGE_SIZE = 200;
/** 25 pages = 5,000 wallets; a real deployment is far below this. */
const MAX_WALLET_PAGES = 25;
/** 100 pages = 20,000 ledger entries. */
const MAX_LEDGER_PAGES = 100;
/** 20 pages = 4,000 active holds (consumed holds are deleted). */
const MAX_HOLD_PAGES = 20;

/** Mismatches stored in `system/walletInvariants` (the response carries all). */
const MAX_STORED_DRIFT = 100;

const NO_STORE = { "Cache-Control": "no-store" } as const;

type WalletDriftKind =
  | "wallet_negative_balance"
  | "wallet_balance_mismatch"
  | "wallet_reserved_mismatch";

interface WalletDrift {
  kind: WalletDriftKind;
  walletId: string;
  detail: string;
  /** Carried from an earlier run so an open case shows its age. */
  firstSeenAt?: Date;
}

interface Scan {
  docs: DocumentSnapshot[];
  truncated: boolean;
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
  maxPages: number
): Promise<Scan> {
  const docs: DocumentSnapshot[] = [];
  let cursor: DocumentSnapshot | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const query = adminDb
      .collection(collection)
      .orderBy(FieldPath.documentId())
      // firestore-list: internal — fixed page cap; truncation is reported.
      .limit(PAGE_SIZE);

    const snapshot = await (cursor ? query.startAfter(cursor) : query).get();
    docs.push(...snapshot.docs);

    if (snapshot.size < PAGE_SIZE) return { docs, truncated: false };

    // A full page is non-empty, so there is always a last document to cursor
    // from. Casting keeps this from becoming an unreachable branch.
    cursor = snapshot.docs.at(-1) as DocumentSnapshot;
  }

  return { docs, truncated: true };
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

  const [wallets, ledger, holds] = await Promise.all([
    scanCollection("wallets", MAX_WALLET_PAGES),
    scanCollection("walletTransactions", MAX_LEDGER_PAGES),
    scanCollection("walletHolds", MAX_HOLD_PAGES),
  ]);

  const truncated = wallets.truncated || ledger.truncated || holds.truncated;

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
  }

  const checked = {
    wallets: wallets.docs.length,
    ledgerEntries: ledger.docs.length,
    activeHolds: activeHolds.matched,
  };

  await adminDb
    .collection("system")
    .doc("walletInvariants")
    .set({
      lastRunAt: now,
      checked,
      driftCount: drift.length,
      drift: drift.slice(0, MAX_STORED_DRIFT),
      driftTruncated: drift.length > MAX_STORED_DRIFT,
      truncated,
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
    scannedAt: now.toISOString(),
  };

  return NextResponse.json(body, {
    // 409, not 200: the scheduled run has to go red for anyone to look.
    status: drift.length === 0 && !truncated ? 200 : 409,
    headers: NO_STORE,
  });
});
