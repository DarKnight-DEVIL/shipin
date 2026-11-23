# 0005 — A dedicated MFA signing secret that fails closed

**Status:** Accepted
**Date:** 2026-11-21

## Context

Admin MFA elevation is a short-lived cookie issued after a second factor is
verified. It has to be signed, which needs a secret. The convenient candidate was
already in the environment: `FIREBASE_ADMIN_PRIVATE_KEY`, or a value derived from
it, so no new variable would be needed.

## Decision

`MFA_SESSION_SECRET` is its own required variable, and signing **fails closed**:

- `src/lib/mfaSession.ts` throws when the secret is missing or shorter than 32
  characters. There is no derivation and no fallback.
- The secret is in `PRODUCTION_REQUIRED_SERVER_ENV`, so a deploy without it does
  not boot (ADR-0001) instead of 500ing on the first admin request.
- `MFA_SESSION_SECRET` is also the default signing key for unsubscribe links
  (`src/lib/privacy/unsubscribeToken.ts`), overridable with `UNSUBSCRIBE_SECRET`;
  there the missing-secret behaviour is to omit the link rather than forge a weak
  signature.

## Consequences

- One more production secret to provision and rotate. Rotation invalidates
  outstanding elevation cookies, which is the desired behaviour after a leak.
- The Firebase Admin private key no longer doubles as an MFA-forgery key. If it
  leaks, the blast radius is Firebase access, not "mint an elevation cookie for
  any admin".
- Operators can still break admin MFA by setting a short value; the failure is
  immediate and loud at signing time, and the message names the minimum length.
- `.env.example` must not describe the variable as optional — `envExample.test.ts`
  fails if it does, because that comment used to say a key was derived from the
  Admin private key, which was never true.

## Alternatives considered

- **Derive from the Admin private key.** Rejected: it couples two unrelated
  capabilities and makes one leak worse than the other.
- **Reuse the session cookie secret.** Rejected: an elevation cookie and a login
  session have different lifetimes and different revocation paths; sharing a key
  means a rotation of one silently logs out the other.
