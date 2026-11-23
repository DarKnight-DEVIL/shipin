# 0002 — Static rendering with client-side Firestore; no ISR

**Status:** Accepted
**Date:** 2026-11-21

## Context

The app is a per-user operations tool (requests, wallet, notifications, support)
with a public marketing surface and a tracking page. Every page under `src/app`
is a Server Component, and the App Router prerenders all of them at build time.

The obvious question for a Next.js app is "where is the `revalidate`?" — and for
this one the answer is nowhere. That needs a reason on record, because the next
person will either add one or assume it was forgotten.

## Decision

Pages stay prerendered, and per-user data is read **in the browser** from
Firestore after authentication:

- No page exports `revalidate`; nothing is ISR.
- Signed-in routes serve a **signed-out shell** and hydrate into the user's view.
  That shell is a supported render, not a loading state: `smoke.spec.ts` and
  `auth-flow.spec.ts` assert it.
- The only two overrides are route handlers, not pages: `/api/notifications/unsubscribe`
  (`force-dynamic`) and `/llms.txt` (`force-static`).

## Consequences

- Every page is a CDN hit with no render on request. The shell is the same bytes
  for every visitor, which is also why a signed-in user sees a brief "Sign in"
  label before the auth SDK answers.
- A cached page cannot leak another user's data, because it never contained any.
  This is the security argument for the same decision.
- SEO metadata is static per route (`src/config/seo.ts`), and `sitemap.xml` is
  generated at build time — a new public page must be added to the sitemap in the
  same change or it ships undiscoverable.
- Data freshness is a client concern: Firestore listeners and route refetches,
  not a `revalidate` window someone tunes. Nothing on the server can go stale.
- The first authenticated paint is later than a server-rendered one would be.
  That cost is accepted and visible in the landing page's signed-in label.

## Alternatives considered

- **Server-render the dashboard from Firestore with ISR.** Rejected: the data is
  per-user, so a cached page would either be personalized (uncacheable, and a
  privacy incident if the cache key is ever wrong) or empty (what we already
  serve, without the client subscription).
- **`revalidate = 0` (dynamic rendering) everywhere.** Rejected: it turns every
  page into a function invocation for a shell that does not change.

See `docs/ARCHITECTURE.md` §6 for the current-state description.
