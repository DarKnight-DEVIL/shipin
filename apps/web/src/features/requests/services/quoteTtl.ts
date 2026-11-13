/**
 * The quotation window, in one place.
 *
 * A quote prices live market data — the store's current price, domestic
 * freight and international freight — so it stops being valid quickly. Every
 * path that issues a quote must use these helpers: the TTL was previously
 * hardcoded as `24 * 60 * 60 * 1000` in four separate files (admin quote
 * panel, admin products panel, quotes service and the customer request
 * service), so changing the window meant finding all four.
 */

export const QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

/** Absolute expiry for a quote issued at `now`. */
export function quoteExpiresAt(now: number = Date.now()): Date {
  return new Date(now + QUOTE_TTL_MS);
}
