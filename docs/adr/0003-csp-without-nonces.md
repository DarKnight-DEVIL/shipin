# 0003 — Strict CSP without nonces

**Status:** Accepted
**Date:** 2026-11-21

## Context

A nonce-based `script-src` is the usual strict-CSP answer: generate a random value
per response, put it in the header, and tag the inline scripts with it. It works
because the nonce is unique per response and an injected script cannot guess it.

This app prerenders every page at build time (see ADR-0002). A build-time HTML
file is served to every visitor, so a per-response nonce has nowhere to go: the
same bytes cannot carry a different nonce. Next.js can only inject nonces when it
renders the page at request time.

## Decision

The CSP in `src/lib/securityHeaders.ts` uses **a host allowlist and directives**,
never a nonce:

- `script-src 'self' 'unsafe-inline'` plus the named hosts that actually serve a
  script. `'unsafe-inline'` is load-bearing: the app's own inline scripts run
  under it, and a nonce cannot be added to build-time bytes.
- `script-src-attr 'none'` — no inline event handlers at all. This is what
  closes the half of `'unsafe-inline'` that can be closed without a nonce.
- `base-uri 'none'` — an injected `<base>` cannot re-point relative URLs.
- The production policy is the only source; the development policy is derived
  from it with the dev-only additions (HMR, eval) in one place, so the two cannot
  drift into "dev is strict, production forgot something".

Any host that is not needed was removed rather than kept "just in case": dead
entries in a policy are dead permissions.

## Consequences

- The policy is one constant for every route, so `securityHeaders.test.ts` and
  `proxy.test.ts` are what keep it from drifting: a host added to the code
  without a test is a host nobody reviews.
- `'unsafe-inline'` stays, so an injected `<script>` element is the remaining
  hole on a prerendered page. ADR-0006 proposes closing it on the authenticated
  tree, which can be rendered per request; this decision is unchanged for the
  prerendered marketing and legal routes.
- `'unsafe-eval'` is absent in production, so a dependency that needs it fails
  loudly instead of silently widening the policy.
- An inline script added by hand to a page will not run — it has no hash. That is
  the intended friction: use a module, which the CSP already allows from `self`.
- Tightening further (e.g. `require-trusted-types-for 'script'`) is possible but
  needs every DOM sink audited first; it is not blocked by this decision.

## Verified against the framework

Next.js 16.4.6, `node_modules/next/dist/docs` is not shipped in the installed
package, so this was checked against the published guide
(<https://nextjs.org/docs/app/guides/content-security-policy>): *"To use a nonce,
your page must be dynamically rendered… Static pages are generated at build time,
when no request or response headers exist — so no nonce can be injected."* The
same page confirms Next.js reads a nonce from the request `Content-Security-Policy`
header, which a build-time prerender cannot have. Nothing in Next 16 changes
this, and the guide notes nonce-based CSP is incompatible with prerendering and
with PPR.

## Alternatives considered

- **Nonce with dynamic rendering.** Rejected: it would undo ADR-0002 for every
  page to harden a header, and the CDN caching is a product requirement.
- **A per-route `'sha256-…'` list for the static pages.** Rejected: the header
  is one constant for every route, so this needs a post-build pass over every
  HTML file and a per-page header — complexity against no user data. ADR-0006
  keeps it as an unfiled alternative.
- **A separate strict policy on dynamic HTML routes.** This ADR first rejected it
  on the grounds that the dynamic routes were JSON API handlers. That is wrong:
  `/track/[trackingId]` and the admin request-detail pages render HTML per
  request. The alternative is now proposed for the authenticated tree in
  ADR-0006.
