/**
 * Money as integer minor units (ADR-0008).
 *
 * A `Minor` is an integer count of a currency's smallest unit — cents for USD.
 * Every arithmetic operation on money in this codebase happens in `Minor`, and
 * the two conversions (`parseMinor`, `toDecimal`) live here so that the number
 * of places a decimal can enter or leave the system is two, and both are tested.
 *
 * Two rules keep the rest of the codebase honest:
 *
 *   1. Nothing outside this module divides a `Minor` by anything except an
 *      integer, and rounding is explicit at the call site (`scaleByRate`).
 *   2. A label that carries money is suffixed `…Minor` in the name. TypeScript
 *      cannot stop someone adding a decimal to a `Minor`, so the name is the
 *      only in-code warning a reader gets; `balanceMinor` is a signal that
 *      `balance` is not.
 */

/** Currency codes ShipIN charges in. Adding one means adding its exponent. */
export type Currency = "USD";

/**
 * Minor-unit exponent per currency: one USD is 100 minor units.
 *
 * Kept explicit rather than hardcoded to 2 so a currency with a different
 * minor unit cannot be added without deciding its precision here.
 */
const MINOR_UNIT_EXPONENT: Record<Currency, number> = {
  USD: 2,
};

export const DEFAULT_CURRENCY: Currency = "USD";

/** An integer number of minor units. Negative for refunds and adjustments. */
export type Minor = number;

/** Largest amount accepted, in minor units ($9,999,999.99). */
export const MAX_MINOR: Minor = 999_999_999;

function exponentFor(currency: Currency): number {
  const exponent = MINOR_UNIT_EXPONENT[currency];

  if (exponent === undefined) {
    throw new Error(`Unsupported currency: ${String(currency)}`);
  }

  return exponent;
}

/** The number of minor units in one whole unit (100 for USD). */
export function minorPerUnit(currency: Currency = DEFAULT_CURRENCY): number {
  return 10 ** exponentFor(currency);
}

/** Whether a value is a usable `Minor`: an integer, safe, within range. */
export function isMinor(value: unknown): value is Minor {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= MAX_MINOR
  );
}

/**
 * Parse a decimal amount into minor units, exactly.
 *
 * Accepts a finite number or a decimal string (PayPal sends `"84.70"`). More
 * precision than the currency has is an error, not a silent round: `84.703` is
 * a caller bug, and rounding it here would hide it behind a cent. Scientific
 * notation (`1e3`) is rejected for the same reason — it hides where the value
 * came from.
 *
 * Throws rather than returning a sentinel so that a malformed amount cannot be
 * mistaken for zero and silently skip a charge.
 */
export function parseMinor(
  value: number | string,
  currency: Currency = DEFAULT_CURRENCY
): Minor {
  const exponent = exponentFor(currency);

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Not a finite amount: ${String(value)}`);
    }

    // Scale in one step and check the result is whole. Comparing the products
    // instead (`value * 100`) would reintroduce the float noise this module
    // exists to avoid.
    const scaled = Number(value.toFixed(exponent + 1));

    if (Math.abs(scaled) > MAX_MINOR / minorPerUnit(currency)) {
      throw new Error(`Amount out of range: ${String(value)}`);
    }

    const minor = Math.round(scaled * minorPerUnit(currency));

    // `toFixed(exponent + 1)` keeps one spare digit, so anything with a third
    // decimal fails here instead of being rounded away.
    if (Math.abs(scaled * minorPerUnit(currency) - minor) > 1e-6) {
      throw new Error(
        `Amount has more than ${exponent} decimal place(s): ${String(value)}`
      );
    }

    return minor;
  }

  const text = value.trim();

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Not a decimal amount: ${JSON.stringify(value)}`);
  }

  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");

  if (fraction.length > exponent) {
    throw new Error(
      `Amount has more than ${exponent} decimal place(s): ${JSON.stringify(value)}`
    );
  }

  const minor = Number(whole) * minorPerUnit(currency) +
    Number(fraction.padEnd(exponent, "0"));

  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MINOR) {
    throw new Error(`Amount out of range: ${JSON.stringify(value)}`);
  }

  return negative ? -minor : minor;
}

/**
 * A `Minor` as a decimal number, for the edges that still speak decimals.
 *
 * Exact for every value in range: the result is a dyadic rational times a power
 * of ten, so the division introduces no error a caller can observe at two
 * decimals.
 */
export function toDecimal(minor: Minor): number {
  assertMinor(minor);

  return minor / 100;
}

/**
 * A `Minor` as a decimal string with the currency's precision (`"84.70"`).
 *
 * This is what the PayPal API takes; sending it the decimal number instead
 * gives `"84.7"` for some amounts and `84.70000000000002` for others.
 */
export function toDecimalString(
  minor: Minor,
  currency: Currency = DEFAULT_CURRENCY
): string {
  assertMinor(minor);

  const perUnit = minorPerUnit(currency);
  const exponent = exponentFor(currency);
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);

  return `${sign}${Math.floor(absolute / perUnit)}.${String(
    absolute % perUnit
  ).padStart(exponent, "0")}`;
}

/** Additive identity, typed so a sum has somewhere to start. */
export const ZERO_MINOR: Minor = 0;

/** Exact sum. Throws if any addend is not a `Minor`. */
export function sumMinor(...amounts: Minor[]): Minor {
  return amounts.reduce((total, amount) => {
    assertMinor(amount);

    return total + amount;
  }, ZERO_MINOR);
}

/** Exact difference. Throws if either side is not a `Minor`. */
export function subtractMinor(left: Minor, right: Minor): Minor {
  assertMinor(left);
  assertMinor(right);

  return left - right;
}

/** Exact negation, for a refund of a stored charge. */
export function negateMinor(amount: Minor): Minor {
  assertMinor(amount);

  return -amount;
}

/**
 * Scale by a rate (a percentage, a tax rate) and round once, half-up.
 *
 * Half-up rather than banker's rounding because a fee that lands on half a cent
 * goes to the customer's side of the ledger in PayPal's own arithmetic; rounding
 * to even here would disagree with the amount PayPal actually charges.
 */
export function scaleByRate(amount: Minor, rate: number): Minor {
  assertMinor(amount);

  if (!Number.isFinite(rate)) {
    throw new Error(`Not a finite rate: ${String(rate)}`);
  }

  // `Math.round` is half-up for positives and half-toward-+∞ for negatives;
  // mirror it so a negative adjustment rounds symmetrically.
  const scaled = amount * rate;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));

  return rounded === 0 ? 0 : rounded;
}

/**
 * Divide by a rate, rounding once, half-up.
 *
 * This is the gross-up: `(amount + fixedFee) / (1 - percentage)`. Doing it on
 * the decimal forms means the division happens in binary floating point and the
 * result carries a tail that a later `toFixed(2)` has to guess at. Doing it
 * here rounds once, at a place that has a test.
 */
export function divideMinor(amount: Minor, divisor: number): Minor {
  assertMinor(amount);

  if (!Number.isFinite(divisor) || divisor === 0) {
    throw new Error(`Not a usable divisor: ${String(divisor)}`);
  }

  const quotient = amount / divisor;

  return Math.sign(quotient) * Math.round(Math.abs(quotient));
}

/**
 * Split a `Minor` across weights so the parts sum to the whole exactly.
 *
 * Largest-remainder: give every part the floor of its share, then hand the
 * leftover units to the parts with the largest remainders. Splitting a $100.00
 * refund across three lines yields 3334, 3333, 3333 — never 3333.33 × 3 and a
 * cent that belongs to nobody.
 */
export function allocateMinor(
  total: Minor,
  weights: readonly number[]
): Minor[] {
  assertMinor(total);

  if (weights.length === 0) {
    throw new Error("Cannot allocate across zero weights");
  }

  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("Allocation weights must be finite and non-negative");
  }

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

  if (weightSum <= 0) {
    throw new Error("Cannot allocate across zero total weight");
  }

  const sign = total < 0 ? -1 : 1;
  const absolute = Math.abs(total);
  const exact = weights.map((weight) => (absolute * weight) / weightSum);
  const floors = exact.map((share) => Math.floor(share));
  let remainder = absolute - floors.reduce((sum, share) => sum + share, 0);

  const order = exact
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((left, right) =>
      right.fraction === left.fraction
        ? left.index - right.index
        : right.fraction - left.fraction
    );

  const result = [...floors];

  for (const { index } of order) {
    if (remainder <= 0) break;

    result[index] += 1;
    remainder -= 1;
  }

  return result.map((share) => share * sign);
}

/**
 * Read an amount out of a document, whichever representation it holds.
 *
 * The compatibility edge of ADR-0008: documents written before the migration
 * hold a decimal, documents written after hold `Minor`. Reading both is what
 * lets the two live side by side; the tolerance is the legacy float tail that
 * Firestore and JSON add (`84.69999999999999` for `84.70`).
 *
 * A missing value reads as `0`, which callers treat as "no money" and reject —
 * the same contract `toNumber` in `lib/paypal/amounts.ts` had.
 */
export function minorFromStored(
  value: unknown,
  currency: Currency = DEFAULT_CURRENCY
): Minor {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;

    return parseMinor(Number(value.toFixed(exponentFor(currency))), currency);
  }

  if (typeof value === "string") {
    const text = value.trim();

    // A string that is already whole minor units is indistinguishable from a
    // decimal, so the caller is expected to pass numbers; a numeric string is
    // treated as a decimal, which is what older rows hold.
    return /^-?\d+(\.\d+)?$/.test(text) ? parseMinor(text, currency) : 0;
  }

  return 0;
}

/** Narrowing guard used by the arithmetic helpers. */
function assertMinor(value: unknown): asserts value is Minor {
  if (!isMinor(value)) {
    throw new Error(`Not a money amount in minor units: ${String(value)}`);
  }
}
