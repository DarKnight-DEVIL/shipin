# 0001 — Production configuration fails closed at startup

**Status:** Accepted
**Date:** 2026-11-21

## Context

Several subsystems degrade quietly when their configuration is missing, and the
quiet degradation is the dangerous part:

- Rate limiting without a shared store limits each instance separately, and the
  limiter fails open when the store is unreachable.
- PayPal webhook verification without `PAYPAL_WEBHOOK_ID` cannot prove a delivery
  came from PayPal — treating it as genuine means anyone can mark an order paid.
- Admin MFA sessions without `MFA_SESSION_SECRET` cannot be signed, so every
  admin request 500s.
- Missing Firebase Admin credentials surface on the first request that needs
  them, not at boot.

A deployment that serves traffic in any of those states looks healthy from the
outside: pages render, sign-in works, and only the missing protection is silent.

## Decision

`validateProductionRequiredEnv()` (called from `src/instrumentation.ts`) throws at
startup in production when a required variable is absent, naming the variable and
why the deployment must not run without it. The sets live in
`src/config/env/index.ts`: `REQUIRED_SERVER_ENV`, `PRODUCTION_REQUIRED_SERVER_ENV`
and the rate-limit store pair.

Two consequences of "fail closed" are deliberate:

- **The checks run twice.** `npm run check:production-env` runs the same
  validator against a release environment before rollout, with a CI job that
  asserts both the refusal (naming the variables) and the complete case. A gate
  that only exists at boot is discovered by users.
- **There is exactly one opt-out.** `RATE_LIMIT_STORE_OPTIONAL=1` exists for the
  E2E suite, which runs a production build against a throwaway database and
  would otherwise refuse to boot. It is read in one place, must be the string
  `1`, and anything else still fails the check.

## Consequences

- A misconfigured deploy never serves traffic. The cost is a boot crash instead
  of a degraded service, which is the trade this record accepts.
- Local development and E2E need the variables present but not meaningful, so
  `.env.example` carries placeholders and the E2E runner supplies dummies. That
  is why `getAdminApp()` reads the service-account trio before it checks for an
  emulator host.
- Every new production-only requirement is a startup failure waiting to be
  documented, so `src/config/env/envExample.test.ts` fails when a required
  variable is missing from `.env.example` or described there as optional.

## Alternatives considered

- **Warn and continue.** Rejected: `/api/health` reporting `degraded` is a
  monitoring signal, not a control. The failure mode being prevented is abuse
  protection or payment verification silently off, which no page shows.
- **Validate on first use.** Rejected: the blast radius depends on which route a
  user hits first, so the same misconfiguration is a 500 on one path and a
  working page on another.
