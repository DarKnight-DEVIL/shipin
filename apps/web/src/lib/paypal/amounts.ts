/**
 * Money arithmetic for the PayPal routes.
 *
 * Both routes read amounts back out of Firestore, where older rows hold strings
 * and JSON round-trips add float tails, and both compare a client-supplied
 * amount against a server-computed one. Doing that through one pair of helpers
 * keeps the two routes from drifting into different rounding rules.
 */

/**
 * A Firestore numeric value as a finite number.
 *
 * Anything that is not a finite number (missing, `null`, a malformed string)
 * reads as `0`, which the callers treat as "no money" and reject.
 */
export function toNumber(value: unknown): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

/** Rounds to the two decimals PayPal charges and ShipIN stores. */
export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Whether two amounts are the same in whole cents.
 *
 * Comparing the raw floats fails on values that are equal as money
 * (`84.69999999999999` from a subtraction versus `84.7` from Firestore), and a
 * one-cent tolerance would let a browser charge a cent more than the quote.
 */
export function sameCents(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}
