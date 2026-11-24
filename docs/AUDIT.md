# Repository audit — November 2026

A fresh, full-surface audit of this repository: every gate was re-run, and the code was
read rather than trusted. Nothing below is copied from an earlier report, and every
finding is backed by the file/line that shows it or by a command whose output is quoted.

Scope: `apps/web` (Next.js 16 app, 23k LOC, 76 API route files, 35 pages), `packages/*`,
`scripts/`, `.github/workflows/`, `firestore.rules`, `firestore.indexes.json`, Docker and
markdown docs.

---

## 1. What was verified green

| Gate | Result |
| --- | --- |
| `npm run build` (turbo, standalone output) | pass, 83/83 static pages |
| `npm run typecheck` (TypeScript 7.0.2) | clean |
| `npm run lint` | 0 errors, 12 warnings |
| `vitest run` | 249 files / 2573 tests pass |
| `test:coverage` | 97.82% stmts, 98.25% lines, 92.47% branches, 99.04% funcs |
| `check:` ×9 (coverage-globs, money-globs, compliance-tests, firestore-indexes, licenses, workflows, bundle-budget, env-inlining, privacy-policy) | all pass |
| `npm audit --omit=dev` | 0 production vulnerabilities (0 total) |
| Firestore rules suite (re-run earlier this session) | 72/72 |
| Playwright — `npm run test:e2e:local` (production build + Firestore emulator) | pass, 30 passed / 6 skipped, exit 0 |

The money paths themselves are in good shape: wallet settlement prices from the stored
quote inside the transaction, PayPal capture verifies against the stored
`paypalPaymentOrders` document, refunds are guarded against duplicates, cron endpoints use
HMAC + replay window, the proxy blocks cross-site mutations, and Firestore rules deny
customer writes to requests, wallets and quotes. That groundwork is not where the defects
are.

---

## 2. Findings

### 2.0 P0 — a production-mode server without Redis answers **500 to every request**

Verified end to end. With the documented opt-out set and Upstash unset:

```console
$ PORT=3100 RATE_LIMIT_STORE_OPTIONAL=1 UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= \
  node .next/standalone/apps/web/server.js
GET /            -> 500
GET /api/health  -> 500
```

`RATE_LIMIT_STORE_OPTIONAL=1` is honoured only by the **startup** validator
(`src/config/env/production.ts:283`). The request path never consults it:

- `src/lib/redisRateLimiter.ts:283` — `if (isProduction)` → `throw`, and
  `isRateLimitStoreOptional()` is not imported anywhere in `src/lib`.
- Consequence: `npm start`, the Docker image, `scripts/e2e-local.mjs` and any operator who
  follows `CLAUDE.md`'s "single documented opt-out" get a server that boots and then fails
  every page. `/api/health` fails too, so monitoring cannot tell "degraded" from "down".

Fix: gate the throw on the opt-out and fall through to `fallback.record(request)`, or make
the production policy `degraded + fail-open` when the flag is set. Health must stay
answerable in either case.

**Fixed.** `src/lib/redisRateLimiter.ts` now throws only when
`isProduction && !isRateLimitStoreOptional()` and otherwise uses the in-memory fallback;
`/api/health` already reports that deployment as `degraded`. Regression tests added in
`src/lib/redisRateLimiter.test.ts` (`falls back to the in-memory limiter when the E2E
opt-out is set`). Verified: `npm run test:e2e:local` now runs the production build —
30 passed, exit 0 — where before it answered 500 to every request.

### 2.1 P0 — typo in that error message: it tells operators to set `undefined=1`

`src/lib/redisRateLimiter.ts:292` interpolates **the value** of an env var that names a
different env var:

```ts
`... or set ${process.env.RATE_LIMIT_STORE_OPTIONAL_ENV}=1 only for the E2E suite.`
```

`RATE_LIMIT_STORE_OPTIONAL_ENV` is never set, so the log line reads
`Set undefined=1 only for the E2E suite`. Use the imported constant.

**Fixed.** The message interpolates the constant; a test asserts it contains
`RATE_LIMIT_STORE_OPTIONAL=1` and not `undefined=1`.

### 2.2 P0 — `npm run test:e2e:local` cannot start its server

`src/config/env/production.ts:149` refuses `http://` unless `APP_URL_E2E_OPTIONAL=1`.
`scripts/e2e-local.mjs:120-146` builds the whole E2E env block and never sets it — grep for
`APP_URL_E2E_OPTIONAL` across `scripts/` and `.github/` returned nothing. Observed:

```console
[WebServer] [ShipIN] FATAL: NEXT_PUBLIC_APP_URL may use http:// only on loopback with the E2E opt-out
[WebServer] Refusing to start.
Error: Process from config.webServer was not able to start. Exit code: 1
```

**Fixed.** `scripts/e2e-local.mjs` sets `APP_URL_E2E_OPTIONAL: "1"`, so
`npm run test:e2e:local` — which the CI e2e job runs as `npm run test:e2e:signed-in` —
starts its server and passes (30 passed, 6 skipped, exit 0). No CI workflow change was
needed: the script merges its own env over the job env, so the job-level
`APP_URL: http://localhost:3000` at `ci.yml:464` was never what failed it.

(The one failing spec in my dev run was `sitemap-check.spec.ts` asserting
`<loc>http://localhost:3000/</loc>`. That is not a bug: I invoked Playwright directly, so
`NEXT_PUBLIC_APP_URL` still pointed at Vercel. Under `test:e2e:local` the origin is
rewritten correctly — once §2.2 is fixed.)

### 2.3 P1 — admin list endpoints read whole collections, with no pagination anywhere

**Fixed.** `src/lib/adminPagination.ts` gives all four routes one cursor format
(`?limit`/`?cursor`, base64url of the last `createdAt`; default page 100, clamped at 200;
a malformed cursor is a 400, not a silent page one) and one page shape
(`{ items, nextCursor, hasMore }`):

- `GET /api/admin/requests` serves pages newest-first, documents still whole (§2.3b), plus
  an optional `?status=` filter pushed into the query so a single-status queue reads only
  that status. That equality filter next to the `createdAt` order is the new composite
  index declared in `firestore.indexes.json`, which `check:firestore-indexes` enforces.
- `GET /api/admin/users` pages newest-first; the client-side `.sort()` is gone.
- `GET /api/admin/customers` pages the users and loads wallet balances only for that
  page's users, through `in`-queries chunked at the 30-value Firestore cap. Admin rows are
  filtered after paging so a page of admins costs one read, not a refetch. The
  `?requestId=` refund branch is unchanged.
- `GET /api/admin/analytics` projects only the fields the dashboard aggregates
  (`.select(...)`, no items/photos/addresses off the wire) and serves repeated loads from
  a 60-second server-side cache, so a refresh no longer re-bills the collection.

The clients (`requestQueueClient`, `customersClient`, the admin users page) loop the pages
with a 200-page safety net; plain status filters are pushed down to the server while the
refund/quote synthetic filters stay client-side — `refund_requested` collides with a
status value, and pushing it down would have returned a different, narrower set than the
filter promises.

Still open from this finding: the client-side equivalents `getWarehouseInventory()`
(`src/features/requests/services/warehouse.ts:21`) and
`subscribeToAllSupportTickets()` (`src/features/support/services/index.ts:202`), and the
aggregate/mirror document for analytics (the cache bounds the cost per refresh, not per
write).

### 2.3b P1 — that same endpoint hands the admin screens documents typed as `Request`

`GET /api/admin/requests` projects seven fields
(`src/app/api/admin/requests/route.ts:40-52`: id, userId, customerName, email, status,
createdAt, updatedAt), and `src/features/admin/services/requestQueueClient.ts:34` casts the
result `as unknown as Request[]`. The cast is what hides the mismatch, and the screens
read the missing fields:

- `src/app/admin/purchasing/page.tsx:560` renders `request.quote?.breakdown?.grandTotal`,
- `:566` renders `request.items ?? []`,
- `src/features/admin/hooks/useAdminAudit.ts:50-53` feeds the audit console the same list.

So the purchasing queue shows no products and no quote total, silently — no error, no
permission failure, just empty data. Return the whole document (once paginated) or extend
the projection to the fields these screens use, and drop the `as unknown as` cast so the
next mismatch is a compile error.

**Fixed.** The route now returns each document whole
(`src/lib/firestoreJson.ts` serializes Timestamps at any depth;
`requestQueueClient.ts` restores them), and the client's single boundary assertion covers a
payload that is no longer truncated. Three more silent failures fell out of the same
projection while fixing it:

- `getAdminRequestPriority` (`requestQueueClient.ts`) reads `refundRequest` and
  `quoteRegenerationRequested`; both were always `undefined`, so the queue sorted as if no
  request had ever asked for a refund or a re-quote.
- `admin/purchasing/page.tsx:230-235` sorts the purchase history on
  `request.purchasedAt`, which the projection dropped — the history was in arbitrary order.
  (The fixture in `requestQueueClient.test.ts` asserted the wrong order, so the broken sort
  was pinned by a test; it now asserts priority order.)
- `matchesAdminRequestFilter` had the same blind spots, so the "refund requested" and
  "quote requested" filters selected nothing.

Pagination (§2.3) is still open: the route reads the whole collection. It is no more
*reads* than before — `get()` already fetched every document — but the response body is now
proportionally larger.

### 2.4 P1 — shipments break past 30 consolidation members

**Fixed.** `getShipmentRequests` chunks the ids at 30 and reassembles the results in the
shipment's own order (the order the consolidation was built in); a request that has since
vanished is skipped instead of breaking the page.

### 2.5 P1 — five data-rights endpoints exist, are tested, and nothing can reach them

Routes present in `src/app/api/` and classified in `routeAuth.ts` but referenced by no
page, component, script or E2E spec (verified by scanning every non-API `.ts/.tsx`):

`/api/user/export`, `/api/user/data`, `/api/user/consent`, `/api/user/grievance`,
`/api/user/age-verification`, plus `/api/compliance/dashboard`,
`/api/admin/wallet/balance`, `/api/admin/shipments/[shipmentId]`.

`src/components/settings/DataPrivacySection.tsx` only calls `/api/user/erase`, so a
customer cannot exercise access, portability, consent or grievance rights from the product
even though the code implements them.

Worse, the portability promise has no fulfiller: `POST /api/user/export:15-25` records a
rights request and answers "You will receive a download link when ready", but nothing in
the repo generates or sends that link. `src/lib/compliance/portability.ts:16` — the module
named for the obligation — returns
`data: {} as Record<string, unknown>` with a comment saying the caller must implement it.

### 2.6 P2 — dead code: 2,534 LOC in 28 orphan modules, plus a whole state layer

Scanned every source file for importers (excluding its own test):

- **28 modules with no importer, 2,534 LOC.** The largest group is the marketing site:
  `src/components/landing/{HeroSection,FAQSection,PricingSection,ProofSection,NetworkSection,
  PipelineSection,CTASection,Footer,SiteHeader,MarketTicker,PlanDialog,TimeAgo}.tsx`. The
  live landing page is a single 1,308-line `src/app/_landing/LandingShell.tsx` that
  re-declares the plans, corridors and copy those files hold. Two landing page
  implementations now exist, and only one is rendered.
  Others: `src/components/checkout/{OrderSummary,CostBreakdown,CheckoutHeader,HelpCard}.tsx`,
  `src/components/request/{TrackingCard,RequestProgress,PackingPhotos}.tsx`,
  `src/components/admin/dashboard/KPICard.tsx`,
  `src/components/globe-dashboard/{LocationsPanel,MotionToggle}.tsx`,
  `src/lib/firebaseLazy.ts`, `src/config/env/env-requirements.ts`.
- **`src/stores/index.ts` (123 LOC) is imported by nothing.** It is the only file that
  imports `zustand`, so the dependency (`apps/web/package.json:86`) exists solely for dead
  code.

**Fixed (partly).** Deleted: the whole second landing implementation
(`src/components/landing/*`, 19 files), `src/config/landing.ts` (only the dead components
imported it), `src/stores/index.ts` and the `zustand` dependency. The remaining orphans
(checkout, request, admin-dashboard, globe-dashboard components, `firebaseLazy.ts`,
`env-requirements.ts`) are still open, as are the workspace packages, the unused schemas
and the `POST` stub.
- **Three of four workspace packages have no consumers.** `@shipin/config` is imported
  once (`SITE_CONFIG`); `@shipin/ui`, `@shipin/shared` and `@shipin/utils` are built,
  tested and listed in `transpilePackages`, and no app file imports them.
- **14 Zod schemas are exported and never used** — `namedIdSchema`, `adminReasonSchema`,
  `labelSchema`, `whatsappTemplateSchema`, `supportMessageBodySchema`,
  `adminCreditBodySchema`, `adminRefundBodySchema`, `customerRefundBodySchema`,
  `newQuoteBodySchema`, `quoteItemSchema`, `quoteBreakdownSchema`, `createTopupBodySchema`,
  `captureTopupBodySchema`, `ticketIdSchema` (`src/lib/validation.ts`). The routes they were
  written for validate by hand instead (§2.7).
- `/api/tracking/[trackingId]` exports a `POST` that always answers `501 not implemented`
  (`route.ts:76`), and `/api/admin/shipments/[shipmentId]` is unreferenced.

### 2.7 P1 — 25 routes validate by hand, and 14 parse the body outside a guard

Measured over every `src/app/api/**/route.ts` that reads a JSON body:

- **25** do it with neither `validateBody` nor `safeParse` — they hand-check fields:
  `admin/wallet/credit`, `admin/users`, `admin/requests/[requestId]/{additional-items,
  refund-offer,shipment}`, `admin/shipments/[shipmentId]`, four `auth/mfa/*` routes,
  `auth/password-leak-check`, `compliance/{breach,dashboard}`, all four `paypal/*` routes,
  `r2/view`, `support/[ticketId]/message`, `user/{age-verification,consent,grievance,
  password}` and `whatsapp/test`.
- **14** read `request.json()` outside any `try`, so a malformed body becomes a 500
  instead of a 400. **11** are in both groups — neither a schema nor a guard:
  `admin/requests/[requestId]/{additional-items,refund-offer,shipment}`,
  `admin/wallet/credit`, five `auth/mfa/*` + `webauthn` routes,
  `paypal/create-wallet-topup`, `r2/view`, `support/[ticketId]/message`.

Two concrete consequences:

- Coercion replaces validation. `admin/wallet/credit:32` does `Number(body.amount)`, so
  `"50"`, `" 50 "` and `[50]` are all accepted as credits; `admin/users:99` casts
  `(body ?? {})` to a shape. `admin/users:86` and `user/password:53` do guard the parse,
  `admin/wallet/credit:27` does not.

The strict schemas that would fix this are already written and tested — see §2.6.

### 2.8 P1 — `/api/whatsapp/test` bypasses the admin MFA gate

Every other admin route calls `requireAdmin`, which enforces App Check, verified email,
account state, role **and** an enrolled second factor with a per-request code
(`src/lib/adminAuth.ts:46-200`). `src/app/api/whatsapp/test/route.ts:28,34` uses
`requireAuthWithProfile` plus a manual `profile.role !== "admin"` check, so an admin who
has not completed MFA (or a stolen admin ID token with no MFA proof) can drive the
business WhatsApp account. Use `requireAdmin`, or delete the endpoint — nothing in the UI
calls it.

### 2.9 P1 — the marketing page sells plans the billing code does not implement

`src/app/_landing/LandingShell.tsx:40-90` offers **Standard $0 / Express $9 / Merchant
"Freight"** "service fee per request", with Express promising "30 days of free
warehousing". The money path has no tier concept at all: `src/config/pricing.ts` and
`calculateServiceFee()` implement a bracket model only ($0 up to $10, $5 up to $30, 10%
min $10, manual above $500), and `warehousePolicy.ts:12-16` frees 3 / 7 / 14 days by
shipping preference — never 30. Selecting a plan changes no charge. "Up to 3 SKUs per
request" is also unenforced: nothing caps `items` at creation time (only quotes are capped,
at 100).

Either implement tiers in `PRICING` or make the page describe the bracket model it actually
charges.

**Fixed — the page now describes the bracket model.** The pricing section renders three
bands derived from the code that bills (`src/config/serviceBands.ts` reads `PRICING` and
`warehousePolicy`; `LandingShell` renders `SERVICE_BANDS`), so the copy cannot drift
silently again: `src/config/serviceBands.test.ts` feeds representative order values
through `calculateServiceFee` and fails if the advertised price, the thresholds or the
storage window (3–14 days, then $3/day) stop matching. The fictional tier is gone from
everywhere it was sold:

- the landing cards ("Free / Flat fee / 10% of products", CTA straight to
  `/requests/new` — the `?plan=` parameter was read by nothing),
- the FAQ answer that claimed "Express includes consolidation" against a seven-day window
  nothing implemented,
- `/terms` and `/refund-policy`, which promised refunds of an "Express tier fee" that could
  never be charged (§2.3 of the refund policy is now about the service fee, and the terms
  test asserts the new wording).

Still open, and deliberately so: whether "up to 3 SKUs per request" should exist is a
product decision — the cap is unenforced in the request flow either way.

### 2.10 P2 — the component layer is effectively untested

143 `.tsx` component files, 14 with tests. `vitest.config.ts:44-55` excludes
`src/components/**/*.tsx` from coverage on the grounds that "they are covered by the E2E
pass" — but that pass is 10 specs, and per §2.2 it does not currently run locally or in CI.
So the `.tsx` surface (checkout, admin console, settings, dashboard) has neither unit nor
browser coverage behind a gate. Either wire the E2E job, or measure the components and set
a floor.

Also of note: `check:authorized-domains` is not referenced by any workflow, and skips
itself without credentials — `Skipped: no Firebase project id configured` — so the domain
allowlist gate has never run in CI.

### 2.11 P3 — smaller items

- `src/app/sitemap.ts:19-40` hardcodes `lastModified` dates (`"2026-09-01"`, …). Search
  engines learn to ignore a stale `lastmod`; derive it from build time or content.
- Docs drift: `README.md:13-14` says "TypeScript 5" (actual 7.0.2) and "React 19.2" (actual
  19.3.1); its layout block lists `stores/` (dead, §2.6) and "hooks/ … axe accessibility
  scans" (the scanner is `src/lib/axeScan.ts`, dev-only).
  `docs/ARCHITECTURE_AUDIT.md:107` says 228 files / 2,415 tests (actual 249 / 2,573) and
  `:23` still points at `src/middleware.ts`; `SECURITY_AUDIT.md` references a
  `src/lib/csrf.ts` that no longer exists.
- `packages/config/src/site.ts` exports `API_ROUTES` (`ROUTES`, `API_ROUTES`) with entries
  such as `/api/support` and `/api/requests` that are not routes in this app; nothing
  imports them.
- `src/app/api/tracking/[trackingId]/route.ts` `POST` → 501 (§2.6) is still classified and
  rate-limited as a real endpoint.

---

## 3. What was not verified

- `check:production-env` — refuses to run without real production secrets, by design.
- `check:authorized-domains` — needs a Firebase project id and access token (§2.10).
- `test:rules` — re-ran green earlier in this session (72/72); not re-run here to avoid
  disturbing the emulator the E2E run needs.
- Signed-in E2E specs (`--signed-in`) — blocked by §2.2.
- Live PayPal / R2 / Resend / WhatsApp calls — no credentials, and none should be added.

---

## 4. Suggested order of work

1. ~~§2.0 / §2.1 / §2.2~~ — **done**: the opt-out is honoured on the request path, the
   message names the real variable, and `test:e2e:local` runs green (30 passed).
2. ~~§2.3b~~ — **done**: the admin queue receives whole documents, with Timestamps
   restored, so items, quotes, refund flags and the purchase-history sort work.
3. ~~§2.6 (landing half) + §2.9~~ — **done**: the dead landing implementation, the unused
   store and `zustand` are gone, and the pricing copy is generated from `PRICING` and
   `warehousePolicy` with a test that fails on drift. Remaining §2.6 orphans (checkout,
   request, dashboard components, workspace packages, unused schemas) are still open.
4. ~~§2.3 / §2.4~~ — **done**: the four admin list routes page via `?limit`/`?cursor`
   (`adminPagination.ts`), analytics projects and caches for 60 s, customers loads wallet
   balances in 30-value chunks, and `getShipmentRequests` chunks past the `in` cap.
5. §2.5 — either wire the rights endpoints into Settings or delete the routes and the
   promise in `POST /api/user/export`; a compliance endpoint nobody can call is worse than
   none.
6. §2.7 — adopt the 14 existing schemas in the routes they were written for.
