# 0009 — No API version prefix until a second independent consumer

**Status:** Accepted
**Date:** 2026-11-27

## Context

Every route lives under `/api/**` with no version segment, and the API has no
deprecation policy. The conventional advice — prefix everything with `/api/v1`,
negotiate by header — is cheap to adopt on day one and expensive to retrofit.
So the question is not "is versioning good?" but "who does versioning protect,
and do they exist?"

The consumers today:

- **The web client** — the same repository, the same Next.js app, deployed in
  the same push. A client change and the API change it depends on go out
  together; there is no window in which a new client meets an old server or the
  reverse.
- **GitHub Actions cron jobs** — same repository, HMAC-authenticated, updated in
  the same commit that changes the route they call.
- **PayPal webhooks** — the contract is PayPal's, not ours: the provider signs
  each event, retries on failure, and versions its own payload shapes. A
  `/v1` segment on our side would not enter that contract.
- **The Firebase client SDK** — versioned upstream, unrelated to our paths.

There are no mobile applications, no public/third-party API consumers, and no
API keys issued to anyone.

The contract that does exist is documented: `docs/API.md` is generated from
`src/app/api/**` and `src/config/routeAuth.ts` by `npm run gen:api-docs`, and
`src/config/apiDocs.test.ts` fails when the table and the routes drift. An
unclassified route fails the boot, so the surface cannot grow silently either.

## Decision

No version prefix and no version negotiation. The URL space stays
`/api/**`.

The trigger to revisit is concrete: a **second consumer that deploys
independently of this repository** — a mobile app, a public API, a partner
integration. When that happens, freeze the existing routes as `v1` (a prefix
alias or a documented freeze, decided then), adopt `/api/v2/**` for the next
breaking change, and write the deprecation window into `docs/API.md`.

## Alternatives rejected

- **Adopt `/api/v1/...` now.** It would rewrite 78 route paths, the proxy's
  classification table (`routeAuth.ts`), the generated route manifest and docs,
  every client call site, and the test suite that walks the tree — churn with
  zero protected consumers, and a second URL for every route that must be kept
  classified, documented and tested forever.
- **Header-based negotiation.** The same duplication, but the version is
  invisible in logs, proxies and bug reports, and a missing header needs a
  default that quietly couples client and server anyway.

## Consequences

What got worse: until a second consumer exists, a breaking change to a route
body can break every consumer at once, and the only safety net is this
repository's own tests plus the atomic deploy. That is acceptable while the
only consumer is the app itself — but the longer the un-prefixed surface grows,
the more expensive the eventual `v1` freeze becomes. That cost is accepted,
deliberately, and this record is the reminder to price it again before the
consumer count changes.
