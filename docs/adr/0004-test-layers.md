# 0004 — Three test layers: mocked, emulator, live sandbox

**Status:** Accepted
**Date:** 2026-11-21

## Context

Every external dependency this app has — Firestore, Firebase Auth, PayPal — was
originally mocked in the unit suite. That is fast and it proves our code handles a
*shape*, but it proves nothing about the other end:

- A Firestore query with a mistyped nested field path returns zero rows. Every
  mock agrees it worked.
- A PayPal release that renames `purchase_units[0].payments.captures[0].amount`
  leaves every mock green.
- Security rules decide who may write; they say nothing about what the Admin SDK
  does with a write.

The failure these gaps allow is the worst kind for this app: money or compliance
state that looks correct in tests and is wrong in production.

## Decision

Three layers, each with a job the others cannot do, and each runnable without
production credentials:

1. **Mocked unit/route tests** (`npm test`, colocated `*.test.ts`) — our logic,
   every branch, milliseconds.
2. **Emulator contract tests** — the real SDK against a real database:
   - `npm run test:rules` — `firestore.rules` (who may write).
   - `npm run test:admin` — Admin SDK behaviour the money paths assume
     (`serverTimestamp`, `increment`, `arrayUnion`, a two-document transaction,
     a nested-path range query, custom claims, `auth/user-not-found`).
3. **Live sandbox contract test** (`npm run test:contract`) — the real PayPal
   sandbox with its own credentials, asserting OAuth, order creation, the order
   echoed back unchanged, and both error paths. It forces the sandbox host and
   cannot move money; a successful capture still needs a payer and stays with the
   staging E2E.

The layers are separate commands and separate vitest configs so a missing
credential or a missing JDK skips only its own layer, and every layer prints why
it was skipped instead of passing quietly.

## Consequences

- CI needs a JDK for the emulator layers and separate sandbox secrets for the
  PayPal layer. Absent secrets, the job warns and records the gap in the run
  summary rather than reporting a green run that verified nothing.
- Contract suites are slower and cannot be run on every file save; the fast
  loop remains `npm test`.
- Each layer has to be kept honest: the emulator layer must assert values the
  mocks do not encode, or it degenerates into a slower copy of the unit suite.
- Emulators do not enforce composite indexes, so index coverage stays with the
  static `check:firestore-indexes` gate; the layers are not a substitute for it.

## Alternatives considered

- **Golden fixtures recorded from the real APIs.** Rejected: they encode the
  assumptions the mocks already encode, and they rot silently when the provider
  changes.
- **Only end-to-end tests against staging.** Rejected: they cannot run on a PR
  from a fork, they move real money, and a failure says "something broke" rather
  than which layer.
