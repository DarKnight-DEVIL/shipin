# 0006 — A nonce CSP for the authenticated tree only

**Status:** Rejected  
**Date:** 2026-11-21  

## Context

ADR-0003 kept a per-response nonce out of the CSP because every page is
prerendered at build time (ADR-0002) and one set of bytes cannot carry a
different nonce for each visitor. It therefore ships `script-src 'self`
`unsafe-inline' …`, closed at the attribute level by `script-src-attr 'none'`.
What remains open on a prerendered page is a `<script>` *element*: an injected
inline script, or a tag written by a third-party script that has already been
allowed to run.

Half of the app does not need to be prerendered. The authenticated tree
(`(platform)`, `/admin`) is per-user: it serves a signed-out shell and hydrates,
so no CDN caches a personalised HTML file, and the only benefit of prerendering
is that the shell arrives as static bytes.

## Decision (rejected)

The route-split nonce CSP proposal has been **rejected** because the codebase
no longer maintains a nonce path for the authenticated tree. Without the
necessary infrastructure to generate and forward nonces per request, the CSP
split cannot be enforced, and attempting to introduce it would add risk without
benefit.

The existing CSP remains in effect:
- `script-src 'self' 'unsafe-inline'` on prerendered routes
- `script-src-attr 'none'` closes attribute-level injection
- `/login` and `/verify-email` keep the looser policy

No further action is needed to implement the nonce split at this time.

## Alternatives considered

- **Nonce everywhere.** Undoes ADR-0002 for the marketing pages, which is a
  product requirement, to harden pages with no user data.
- **Per-page hash headers for the static pages.** Would need a post-build pass
  over every HTML file to collect the inline bootstrap hashes and a header that
  varies per page; the current header is one constant for every route. Not
  attempted — it fights the route-level header cache for no user-data gain.
- **Leave the policy as it is.** Legitimate: `script-src-attr 'none'` already
  closes the cheapest injection primitive, and the remaining hole needs an
  HTML-injection bug that survives React escaping. The nonce is worth having
  only if the authenticated tree is going to render per request anyway.

## Consequences

Since the rejection of this ADR, the CSP remains unchanged:

- **No change to the current CSP:** `script-src 'self' 'unsafe-inline'` on
  prerendered routes, `script-src-attr 'none'` on all routes
- **Authenticated pages remain prerendered:** No shift to per-request server
  renders, so there is no latency change from nonce generation
- **Bundle budget protection intact:** All 20+ routes remain measurable under
  `check:bundle-budget`, with no loss of budgeted routes
- **Two policies no longer needed:** A single CSP policy applies across the
  entire tree, eliminating the risk of drift between static and dynamic policies
- **Inline scripts continue working:** No nonce requirement for hand-written
  inline scripts on any route
- **No `/api/csp-report` harness needed:** Since the policy is not being split,
  there is no report-only transition phase or report endpoint maintenance

The rejection of this ADR preserves the status quo of the CSP configuration
while documenting why the nonce split proposal was not pursued.