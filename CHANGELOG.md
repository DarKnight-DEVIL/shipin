# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Passkey MFA works on localhost again: `Permissions-Policy` allows `publickey-credentials-get=(self)`, and in development the relying party follows the loopback origin the ceremony was served from instead of refusing a shared-hosting `APP_URL` outright or insisting on port 3000. Production still derives the origin from `APP_URL` and rejects shared hosting, where an RP ID would cover other tenants.
- Admin MFA session cookies moved to version 2, which invalidates existing elevated sessions: administrators must complete the MFA challenge once after this deploy. The bump rejects tokens whose claims no longer match the current session format.
- The standalone artefact is now prepared by `npm run build` (`next build && node scripts/prepare-standalone.mjs`), not only by npm's `prestart` hook, so a container or supervisor that runs `.next/standalone/apps/web/server.js` directly no longer serves HTML whose `/_next/static` chunks 404. `prestart` still runs the same idempotent script.
- Turbo hashes the source `.env*` files (`apps/*/.env*`, `.env*`) instead of `**/.env*`. The old glob also matched the copies the tracer left inside `.next/standalone`, so a build changed the global hash of the next build.
- `/api/health` derives the shared-store state from `getRateLimitStoreStatus()`, the same check the limiter uses: a Redis URL that is set but unusable (not https) now reports `degraded` instead of `connected` while every `record()` call returns `unavailable`.
- Installs are npm-only: a root `preinstall` guard fails `yarn`/`pnpm`/`bun` runs before they can write a second lockfile.

### Added
- `npm run emulators` — Firestore and Auth emulators with the Emulator UI on port 4000. `firebase.json` keeps `ui.enabled: false` so `emulators:exec` in CI does not start it; the script passes `--ui` to override that locally.
- Bundle size analyzer integrated via `@next/bundle-analyzer` (`npm run analyze`)
- Playwright E2E smoke tests (`playwright-test/tests/smoke.spec.ts`) covering page loads, API health, security headers, auth redirects, and login page rendering
- ESLint accessibility rules (alt text, anchor content, ARIA props, heading content, click event requirements)
- Startup warning when production runs without Upstash Redis rate limiting (`warnOnMissingRateLimitStore`)
- Node version pinning: `.nvmrc` set to v24, `engines` field updated to >=22.12
- Payment fee math unit tests validating PayPal processing fee calculation and money precision behavior
- Support route validation tests covering sender role enforcement, message trimming, and authorization checks
- MFA status shaping tests covering credential filtering, TOTP enabled/pending detection, backup code counting, and phone number masking
- axe-core integration hook (`src/lib/axeScan.ts`) — lazy-loaded runtime a11y scans that log violations to console on key pages
- axe-core contract tests verifying package availability and hook export shape (`src/lib/axeScan.test.ts`)
- GlobeDashboard wrapped in `<Suspense>` with screen-reader-friendly loading placeholder
- CI accessibility audit job (`a11y`) running axe-core contract tests in GitHub Actions
- **Integration tests** for critical API routes: login-intent (rate limiting), tracking (public access), support messages (auth + role checks), PayPal create-order (auth + validation)
- **Cache-Control headers** for static assets (1 year), landing/tracking pages (ISR with 1hr revalidation), login/verify pages (5min revalidation)
- **Sentry monitoring** integration (`@sentry/nextjs`) with client/server/edge configs, source map upload, error filtering
- **Dockerfile** for production deployments (multi-stage build, non-root user, health check)
- GlobeDashboard code-split with named webpack chunk (`globe-dashboard`) + `webpackPrefetch: true`
- **Monorepo structure** with extracted packages: `@shipin/shared`, `@shipin/config`, `@shipin/utils`, `@shipin/ui`
- **Turbo** monorepo build orchestration with caching
- **Override** vulnerable transitive dependencies (minimatch, rimraf, gaxios, gcp-metadata, google-gax)

### Changed
- `middleware.ts` (now `src/proxy.ts` after the Next.js 16 rename) applies the full `SECURITY_HEADERS` map (CSP, HSTS, Permissions-Policy) and proxy-level rate limiting on every request
- Production CSP tightened: `'unsafe-eval'` dropped, `connect-src` narrowed from a blanket `wss: https:` to the Firebase socket hosts plus named API origins, and the third-party script/style/frame hosts allowlisted explicitly. `'unsafe-inline'` remains in `script-src` and `style-src`: every route is statically prerendered, so Next.js inlines its hydration bootstrap at build time and a per-request nonce can never match it (see `getProductionCSP` in `apps/web/src/lib/securityHeaders.ts`)
- CI pipeline enhanced: multi-Node matrix testing (22, 24), coverage reporting, and dedicated E2E job
- Support message route now validates message is non-empty string after trim (rejects whitespace-only messages)

### Fixed
- Admin MFA elevation no longer becomes unusable without a revocation store. `isMfaSessionDenied` fails closed in production, which is right for a real deployment, but it rejected every freshly minted session too — the local E2E run (production build, no Redis) could elevate and then get 403 from every admin route. `MFA_DENYLIST_OPTIONAL=1`, which the code already referenced but never applied, now opts E2E out, like `RATE_LIMIT_STORE_OPTIONAL`; nothing else sets it.
- `POST /api/auth/mfa/session` no longer answers 429 when the shared rate-limit store is unavailable. A store-less production deployment (and the local E2E run, which blanks Upstash) gets `unavailable` from the limiter, not an over-limit client; the route failed closed, so every admin MFA elevation was refused. It now follows the same fail-open rule as the proxy and `/api/auth/login-intent`.
- The lazy Firestore handle (`@/lib/firebaseDb`) now exposes the SDK's `_delegate`, so `doc(db, …)`, `collection(db, …)` and transactions accept it. Signed-in pages previously hit their error boundary with `Expected first argument to collection()/doc() to be a CollectionReference, a DocumentReference or FirebaseFirestore`.
- `POST /api/auth/mfa/webauthn/verify` treats a missing body as the challenge request instead of answering 500 `Unexpected end of JSON input`, so security-key sign-in can obtain a challenge and elevate the admin session.
- Lazy Firebase client initialisation: importing `@/lib/firebase` or `@/lib/firebaseDb` no longer constructs the app, so server bundles and tests stop paying for (and failing on) client config.
- PayPal refunds carry the original order currency instead of assuming USD.
- The payment webhook takes the customer name from the request document it is settling, not from the payment order, so renamed customers are not overwritten on capture.
- Admin wallet credits preserve the amount the refund request asked for instead of crediting the captured total.
- `/api/paypal/capture-order` runs inside `withErrorHandler` and always releases its capture claim, including when the settlement throws.
- Duplicate Firestore indexes removed; `firebase.json` no longer declares a Storage rules file the app does not use (R2 is the object store).
- Replaced forbidden `require()` calls in `csrf.ts` with proper ES module imports
- Added eslint-disable suppressions with explanations for legitimate `setState` inside effects in support hooks

### Removed
- Deleted `file_list.txt` (18MB artifact) from repository root
- Removed unused `gsap` dependency (~35KB gzipped) — no imports were found anywhere in `src/`

---

## [0.1.0] — Initial Release

### Added
- Next.js 16 + React 19 shipping platform with Firebase Auth/Firestore backend
- Admin dashboard with audit logging, wallet management, warehouse inventory
- Customer-facing request creation, tracking, payment (PayPal), and wallet top-up
- Multi-factor authentication (TOTP, SMS, WebAuthn/passkeys) for admin accounts
- Cloudflare R2 integration for inspection photo storage
- Resend + SMTP dual-channel email delivery with template system
- WhatsApp Business API integration for notification dispatch
- Upstash Redis-backed sliding-window rate limiting (with in-memory fallback)
- Content-Security-Policy, HSTS, X-Frame-Options, Permissions-Policy security headers
- Zod input validation on all API routes
- Firestore and Storage security rules
- Comprehensive README, CLAUDE.md, DESIGN.md, PRODUCT.md, ARCHITECTURE.md docs

[Unreleased]: https://github.com/DarKnight-DEVIL/shipin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DarKnight-DEVIL/shipin/releases/tag/v0.1.0
