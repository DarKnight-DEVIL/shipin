# 0008 — Money at rest is integer minor units

**Status:** Accepted
**Date:** 2026-02-14

## Context

Every amount in ShipIN is a JavaScript `number` holding a decimal, from a wallet
balance to a quote subtotal to a PayPal `value`. That means binary floating
point, and binary floating point cannot represent most money exactly: `0.1 + 0.2`
is `0.30000000000000004`, and a value that has been through JSON and Firestore
often comes back with a tail (`84.69999999999999`).

The codebase has defended against this locally and consistently — `moneySchema`
rejects more than two decimals, `roundMoney` snaps to cents, `sameCents` compares
in whole cents, `validatePaymentAmount` works in whole cents, and
`calculateProcessingFee` rounds with an epsilon. That discipline is why no
incident has come from it. But it is discipline: every new writer has to remember
it, and the failure mode when someone forgets is a silently wrong amount, not an
error. A wallet balance is also a value that gets added to and subtracted from
forever, so a half-cent of drift is permanent and compounds.

The question was whether to keep defending floats or change what is stored.

## Decision

Money is an **integer number of minor units** (`Minor`) everywhere it is
arithmetic and everywhere it is stored. One `Minor` is one cent for USD, and the
currency's exponent is looked up explicitly rather than assumed — `src/lib/money.ts`
is the only module allowed to convert between a minor amount and a decimal.

- Conversion happens at exactly two edges, and nowhere else: the PayPal API
  (decimal strings such as `"84.70"`) and the UI (formatted for display).
- Parsing a decimal into `Minor` is strict. More than the currency's precision is
  a thrown error, not a silent round — a caller that hands over `84.703` has a
  bug, and this is where it should surface. Legacy Firestore values that already
  hold float noise are read through `minorFromStored`, which is the single
  documented tolerance.
- Division that cannot be exact (a percentage fee, splitting a refund across
  lines) uses integer arithmetic with an explicit rounding rule, and allocation
  across weights uses largest-remainder so the parts always sum to the whole.
- New Firestore writes store the integer field; the decimal field is not written
  again. Existing documents are read through the compat helper until the
  migration in the rollout below has run.

## Consequences

**Getting better.** A balance can no longer drift: additions and subtractions are
exact. Comparisons stop needing epsilons. Refund splits that must sum to the
original total do sum to it. A future writer that passes a float with three
decimals fails loudly at the boundary instead of charging a customer a cent more.

**Getting worse, and this is the real cost.**

- Two representations exist during the rollout. A reader that looks only at
  `balance` sees `0` for a document written after the switch. The compat helper
  is therefore mandatory on every read path, and it is the thing to check first
  when a balance renders as zero.
- `Minor` is a plain number and TypeScript will happily let someone add it to a
  decimal. The mitigation is naming (`…Minor` suffix on every field and local)
  and keeping conversion inside `money.ts`, not a type that the compiler enforces.
- Percentages stay inexact by nature. `calculateProcessingFee` now rounds once, at
  a defined place, but a 2.9% + $0.30 reversal still cannot be exact against
  PayPal's own rounding; the fee is computed in minor units and the residual is
  shipIN's, as before.
- Debugging got slightly harder: a Firestore document no longer shows the amount
  a human reads; it shows cents. `toDecimal` in a console session is the fix.

## Rollout

Deliberately phased, because the failure mode of a bad migration here is silently
wrong money rather than a crash:

1. **Calculation layer (this change).** `money.ts` exists with its arithmetic,
   parsing, allocation and formatting, and the fee and PayPal comparison paths
   use it. Storage is untouched, so this phase cannot corrupt data.
2. **Compat reads.** `minorFromStored` is applied on every read path that consumes
   a stored amount, so both representations are understood before anything is
   written in the new one.
3. **New writes store minor units.** Wallet transactions and the wallet balance
   first, since those are the values that accumulate; then requests and quotes.
   Each gets a migration script that converts existing documents and is
   idempotent (a document that already holds the integer field is skipped).
4. **Retire the decimal fields** once a full read audit shows no path still reads
   them, and the compat helper loses its "stored" branch.

Phases 3 and 4 need a deploy window and a script run against production, which is
why this record exists before that work starts rather than after it.

## Alternatives considered

- **Keep floats, add a `roundMoney` call in more places.** Rejected: it is what
  the code already does, and the recurring cost is that every new writer has to
  remember. It also cannot fix accumulation, which is the wallet's whole job.
- **Decimal library (`decimal.js`, `big.js`).** Rejected as the storage format:
  it puts an object where Firestore stores a number, so documents stop being
  queryable and every read needs rehydration. Worth it only for a currency with
  a non-decimal minor unit, which ShipIN does not support.
- **Store integer paise *and* keep INR as the only currency.** Rejected: the app
  charges USD through PayPal, so the unit follows the currency, not the rupee.
- **`Decimal`-typed strings everywhere (`"84.70"` as the stored value).** Rejected:
  strings sort lexicographically and cannot be summed in an aggregation query.
