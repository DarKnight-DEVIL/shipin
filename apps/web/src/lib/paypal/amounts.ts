/**
 * Money arithmetic for the PayPal routes.
 *
 * Both routes read amounts back out of Firestore, where older rows hold strings
 * and JSON round-trips add float tails, and both compare a client-supplied
 * amount against a server-computed one. Doing that through one pair of helpers
 * keeps the two routes from drifting into different rounding rules.
 *
 * The conversions themselves live in `lib/money.ts` (ADR-0008); this module is
 * the compatibility surface for callers that still speak decimals. New code
 * should take a `Minor` from `money.ts` directly and skip these.
 */

import { minorFromStored, toDecimal, type Minor } from "@/lib/money";

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

/**
 * Rounds to the two decimals PayPal charges and ShipIN stores.
 *
 * Same contract as before, now expressed as "convert to cents and back" so the
 * rounding rule is the one in `money.ts` rather than a second implementation of
 * `toFixed(2)`. A non-finite value reads as `0`, matching `toNumber` above.
 */
export function roundMoney(value: number): number {
  return toDecimal(minorFromStored(value));
}

/**
 * Whether two amounts are the same in whole cents.
 *
 * Comparing the raw floats fails on values that are equal as money
 * (`84.69999999999999` from a subtraction versus `84.7` from Firestore), and a
 * one-cent tolerance would let a browser charge a cent more than the quote.
 *
 * A non-finite side is never "the same": both missing values read as zero
 * cents, and reporting a match there would turn a broken amount into an
 * accepted payment.
 */
export function sameCents(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;

  return minorFromStored(left) === minorFromStored(right);
}

/** The same comparison for callers that already hold minor units. */
export function sameMinorCents(left: Minor, right: Minor): boolean {
  return left === right;
}
