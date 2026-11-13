# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Bundle size analyzer integrated via `@next/bundle-analyzer` (`npm run analyze`)
- Playwright E2E smoke tests (`playwright-test/tests/smoke.spec.ts`) covering page loads, API health, security headers, auth redirects, and login page rendering
- ESLint accessibility rules (alt text, anchor content, ARIA props, heading content, click event requirements)
- Startup warning when production runs without Upstash Redis rate limiting (`warnOnMissingRateLimitStore`)
- Node version pinning: `.nvmrc` set to v20.18.0, `engines` field added to `package.json`
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
- Production CSP tightened: removed `'unsafe-inline'` and `'unsafe-eval'` from script/style directives; replaced with explicit domain allowlists
- CI pipeline enhanced: added multi-Node matrix testing (18, 20, 22), coverage reporting, and dedicated E2E job
- Support message route now validates message is non-empty string after trim (rejects whitespace-only messages)

### Fixed
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
