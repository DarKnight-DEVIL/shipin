import "server-only";

/**
 * The largest single credit an administrator may add to a wallet.
 *
 * This is not a product price; it is the rail that catches a typo. A credit is money
 * created by hand, so `1000000` where `100000` was meant is a five-figure mistake that
 * nothing downstream will question - the ledger treats it as a legitimate admin entry.
 *
 * It is configurable because the right ceiling genuinely differs by deployment: a
 * staging project wants a small one, and an account that resells in bulk legitimately
 * needs a larger one. Set `WALLET_CREDIT_MAX` (decimal credits, not minor units).
 *
 * Everything about the parse is deliberately conservative:
 *
 *   - an unset or blank variable keeps the 10,000 default;
 *   - anything that is not a finite positive number keeps the default too, because a
 *     typo that produced `NaN` would make every comparison false and remove the rail
 *     entirely - the failure mode has to be "smaller limit", never "no limit";
 *   - a value above `HARD_WALLET_CREDIT_MAX` is clamped, so a stray zero cannot turn
 *     the rail off in one edit.
 */
export const DEFAULT_WALLET_CREDIT_MAX = 10_000;

/** Ceiling for the override itself: 1,000,000 credits in one entry. */
export const HARD_WALLET_CREDIT_MAX = 1_000_000;

/**
 * The cap this deployment will enforce, in credits (2 dp).
 *
 * Read from `process.env` rather than the `serverEnv` proxy, like the cron routes: the
 * test suite replaces that module with a static object, which would make this
 * unconfigurable there. It also keeps the fallback local - nothing here can be missing
 * at import time.
 */
export function walletCreditMax(): number {
  const raw = process.env.WALLET_CREDIT_MAX?.trim();
  if (!raw) return DEFAULT_WALLET_CREDIT_MAX;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WALLET_CREDIT_MAX;

  return Math.min(Math.floor(parsed), HARD_WALLET_CREDIT_MAX);
}
