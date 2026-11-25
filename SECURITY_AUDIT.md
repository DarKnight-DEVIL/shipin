# ShipIN Security Audit Report

## Summary
This report documents the security hardening applied to the ShipIN website to address vulnerabilities and protect against common attacks.

## Security Controls Implemented

### 1. Rate Limiting
- Per-IP request caps: 100 req/min (web), 30 req/min (API), 10 req/min (strict)
- Proxy-based enforcement via `src/proxy.ts` (Next.js 16 renamed the `middleware` file convention to `proxy`)
- Redis-backed (Upstash) sliding windows, shared across serverless instances; the in-memory implementation is only the development/test fallback. Production boot requires `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` — see Remaining Items

### 2. Security Headers
All responses include:
- **Content-Security-Policy**: Served by `src/proxy.ts` from `getProductionCSP()` — explicit host allowlists for the third-party SDKs actually loaded (PayPal, Google, Vercel analytics; `img-src` deliberately stays `https:` because R2 photo URLs are presigned per request), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, and violation reporting to `/api/csp-report`. `'unsafe-eval'` is **not** allowed. `'unsafe-inline'` **is** still allowed in `script-src` and `style-src`: every route is statically prerendered, so Next.js writes its hydration bootstrap inline at build time and a per-request nonce can never match it. The residual surface is narrowed rather than left open: `script-src-attr 'none'` refuses inline event-handler attributes (React attaches listeners with `addEventListener`, so nothing here emits one), `base-uri 'none'` refuses a `<base>` tag, and every host in `script-src`/`connect-src` is one something actually loads from
- **X-Frame-Options**: DENY (clickjacking protection)
- **Strict-Transport-Security**: max-age=31536000; includeSubDomains; preload
- **X-Content-Type-Options**: nosniff (MIME sniffing prevention)
- **Referrer-Policy**: strict-origin-when-cross-origin
- **X-XSS-Protection**: 0 (modern browsers)
- **Permissions-Policy**: Restricts camera, microphone, geolocation, payment, etc.
- **X-Robots-Tag**: noindex, nofollow

### 3. CORS Configuration
- Origin allowlist enforcement (production domains only)
- Credentials support for cookie/XHR auth flows
- No public-route allowlist: every API route is same-origin and authenticated, so the origin check is the only CORS decision

### 3b. CSRF

**No CSRF tokens, by design.** Four existing controls cover it, and none of them is a token:

- **Bearer-token auth.** Every API route authenticates with a Bearer token from the `Authorization` header, which a cross-origin page cannot set: the browser attaches cookies automatically, but it never attaches an `Authorization` header to a request it was not told to make.
- **Origin allowlist.** A request whose `Origin` is not allowlisted is answered `403 CORS_ORIGIN_NOT_ALLOWED` before any handler runs (`src/proxy.ts`, `src/lib/cors.ts`).
- **`Sec-Fetch-Site` on mutations.** `POST`, `PUT`, `PATCH` and `DELETE` carrying `Sec-Fetch-Site: cross-site` are answered `403 CROSS_SITE_REQUEST_BLOCKED` (`src/proxy.ts`). The browser stamps that header and page script cannot forge it, so it also covers the plain-form-post / `no-cors` shape that may arrive with no `Origin` the allowlist can judge. A request without the header (server-to-server, test clients) is not blocked by this rule.
- **CSP `form-action 'self'`.** Form submissions are limited to this origin, so even a hypothetical XSS could not POST credentials or state changes to an attacker-chosen endpoint.
- **No cross-origin browser client exists to exempt.** Every fetch in the app is a relative `/api/…` path served by the same deployment, so it arrives `Sec-Fetch-Site: same-origin` (or `same-site` for a `localhost` page on another dev port); the E2E suite's `request.post` calls send no `Sec-Fetch-Site` at all. The Firebase Hosting aliases are not allowlisted: they serve nothing (`firebase.json` has no `hosting` block), so an allowlist entry for them would trust an origin no page can load from. `APP_ALLOWED_ORIGINS` is unset, and there is no mobile app or separate admin host — and a native client sends no `Sec-Fetch-Site`, so this rule never sees one. A genuinely cross-origin browser integration would have to be exempted here deliberately, not by loosening the rule for every allowlisted origin.
- The only cookie the app issues is the short-lived admin MFA session (`src/lib/mfaSession.ts`). It is `HttpOnly` and `SameSite=Strict`, so it is neither readable by script nor sent cross-site, and it never authenticates a request on its own — `POST` and `DELETE /api/auth/mfa/session` still require a verified Bearer token.
- **`src/lib/csrf.ts` is not in this tree**, and no CSRF token is issued or read anywhere. An intermediate hardening pass added that double-submit module plus proxy enforcement; it was reverted because no flow issued the cookie, no client sent the header, and the check ran on every method and every API path — including `GET /api/health` and the public routes — so it would have rejected all API traffic. Re-adding a token layer requires wiring issuance, client header injection and unsafe-method-only enforcement first. `README.md` → Security records the same conclusion.

### 4. Authentication Layer (`src/lib/auth.ts`)
- `requireAuth`: Verifies Firebase ID token for any authenticated user
- `requireAuthWithProfile`: User + profile + optional role enforcement
- `requireAdmin`: Verified admin only (wrapped to return NextResponse with proper error codes)
- Token caching to reduce repeated verification calls
- Safe `extractAuth` helper that parses Authorization headers

### 4b. Second Factors (Firebase Identity Platform SMS)

- SMS moved from an app-managed, WhatsApp-delivered OTP to a Firebase-managed
  second factor. Google sends and verifies the code; the app stores no SMS
  secret, hashed code, or attempt counter.
- `requireAdmin` and `GET /api/auth/mfa/session` trust only a verified ID token
  carrying `firebase.sign_in_second_factor`; the removed `X-MFA-SMS` header and
  `/api/auth/mfa/sms/*` routes no longer exist.
- Enrolment and sign-in challenges run entirely in the client SDK, which owns the
  reCAPTCHA verifier; there is no server route that can send a code.
- Admin MFA reset clears Firebase-enrolled factors through `adminAuth.updateUser`
  in addition to the Firestore fields, so support cannot leave an account locked
  behind a factor Firestore does not show.
- TOTP, backup codes and WebAuthn remain app-managed and are unchanged.
- Not verified locally: real SMS delivery and reCAPTCHA require a deployed
  origin and a Blaze project.

### 4c. Compliance and Operations Follow-up

- **Retention:** `executeRetentionCleanup()` now deletes through Firestore batches
  instead of only logging intent. It is dry-run by default, refuses documents
  under a hold or with an open rights request, and only removes `users` records
  for closed accounts. A closed profile's Firebase Auth account is deleted first,
  so a sweep cannot leave a live login with no profile; a refusal keeps the
  profile for the next run and lists it in `retentionFailures`. Profiles with
  `deletionRequestedAt` or `anonymizedAt` are blocked at authentication, so a
  closed account cannot be used while it waits for cleanup. An orphan sweep
  deletes Auth accounts that have no profile (dry run by default).
- **Parental consent:** OTPs are six CSPRNG digits stored as a salted scrypt hash
  with a 10-minute expiry and a five-attempt limit. The code is emailed to the
  parent address recorded on the request; a failed send deletes the pending
  request instead of leaving an unusable one.
- **MFA sessions:** signing requires `MFA_SESSION_SECRET` (min 32 chars). The old
  derivation from the Firebase Admin private key is gone, and production startup
  fails when the secret is missing.
- **Breach escalation:** a critical breach is logged at error level and posted to
  `BREACH_ALERT_WEBHOOK_URL` when configured; a failed page never fails the
  breach record.
- **Money constants:** PayPal percentage and fixed fee come from
  `config/constants.ts` only; the duplicate config module and the inline copies
  are gone. `check-money-globs.mjs` now also honours a `@money-path` marker.
- **Transport:** the shared API client aborts requests after 15s instead of
  waiting indefinitely.
- **Webhooks:** PayPal deliveries are deduplicated by event id, so a provider
  retry cannot process the same capture twice.

### 5. Input Validation (`src/lib/validation.ts`)
Zod schemas for all untrusted inputs:
- Email validation (RFC-compliant regex)
- WhatsApp phone (digits only, 10-15 chars)
- Money amounts (finite, positive, max 2 decimals)
- ID format validation
- Message length limits (2000 chars max)
- Payment/refund method enums (closed sets)
- WhatsApp template names (known templates only)
- `validateBody()` function returns structured errors

### 6. Secured API Routes
| Route | Protection |
|-------|-----------|
| `POST /api/whatsapp/test` | Auth + phone validation + no error echo |
| `POST /api/send-email` | Admin auth + body validation + 60/min rate limit |
| `POST /api/support/[ticketId]/message` | Auth + ticket verification + message sanitization |
| Admin refund/partial-refund/refund-offer routes | Auth + requestId validation + body schemas |
| `POST /api/payment/complete-wallet` | Auth + body validation |
| R2 upload/view routes | Auth + strict input validation |
| Email send routes | Body validation + no relay |

### 7. Critical Security Fixes
- **WhatsApp test** — was open endpoint; now requires auth
- **Email API** — was open SMTP relay; now requires auth + validation + rate limit
- **Support messages** — was unauthenticated; now requires Firebase token
- **Admin routes** — now require verified admin token + input validation

### 8. Environment Configuration
- `.env.example` created with all required variables documented
- `.env*` already in `.gitignore` (prevents committing secrets)
- SMTP/ PayPal/ Firebase/ R2/ WhatsApp credentials all use environment variables

### 9. Debug Mode Shielding
- `X-Debug-Mode: disabled` header in production
- Stack traces and sensitive data hidden from error responses

## Remaining Items
- ~~Create `firestore.rules` and `storage.rules` for Firebase Security Rules~~ ✅ Done
- ~~Upgrade Next.js from 16.3.8 to 16.4.3 (audit reports critical RCE vulnerabilities)~~ ✅ Already current (16.4.6)
- Dependency audit is a real gate: `npm run audit:gate` (CI `security-audit` job, now in `weekly-audits.yml`) runs `npm audit --omit=dev` at high/critical and fails on anything not on the dated allowlist in `scripts/audit-gate.mjs`. The full `npm audit` currently reports **0 advisories** (0 high, 0 critical, 0 moderate) after the lockfile refresh; the production-view gate and the full tree agree. The dated allowlist in `scripts/audit-gate.mjs` remains for a future advisory Microsoft has not fixed yet, and it fails once an entry expires.
- Some customer-facing request routes may need auth (quote, refund, etc.) — see P1 below
- Add CSP nonce support if inline scripts are used — **not possible in the current build**: all routes are statically prerendered, so the inline hydration bootstrap exists before any request and no per-request nonce can match it. `'unsafe-inline'` therefore stays in `script-src`/`style-src`; `getCSPWithNonce` remains in git history for the day the app moves to dynamic rendering. Hashes do not close the gap either — the inline `self.__next_f.push(...)` payload differs per route and per build, so a `'sha256-…'` list would have to be regenerated per route per deploy. The affordable hardening is applied instead: `script-src-attr 'none'` and `base-uri 'none'`, which leave only Next's own `<script>` elements able to execute inline
- Enable Redis-backed rate limiting in production by setting `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. **Current behaviour:** both are required in production and `validateProductionRequiredEnv()` (called from `src/instrumentation.ts`) throws at startup when they are missing, naming both variables and explaining that the deployment would otherwise run with per-instance limits and fail open — so a misconfigured deploy cannot serve traffic with rate limiting silently off. When they are configured, limits are global across serverless regions. If the configured store becomes *unreachable at runtime*, requests are still served (the limiter falls open — an outage must not lock everyone out of signing in) and `/api/health` reports `degraded` so the gap stays visible. The only way to boot a production build without a store is the explicit `RATE_LIMIT_STORE_OPTIONAL=1` opt-out, which exists for the local/CI E2E suite (`scripts/e2e-local.mjs` and the `e2e` CI job) that runs a production build against a throwaway database; nothing else sets it, and `true`/`yes`/any other value still fails the check. `npm run check:production-env` runs that same validator against the environment a release will actually get, before rollout, and CI's `production-env` job asserts both the refusal (naming both variables) and the complete configuration — the build jobs' dummy values never exercised either direction. The startup validator also refuses to boot production with an emulator redirect
(`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_EMULATOR_HUB` or their
`NEXT_PUBLIC_` twins) in the environment — the server would read and write a throwaway
emulator instead of live Firestore; the E2E suite opts out with `EMULATOR_GUARD_OPTIONAL=1`.

## Recommendations
1. **✅ DONE**: CSP is now applied in the request proxy for all non-excluded routes — production uses `getProductionCSP()`: no `'unsafe-eval'`, a narrowed `connect-src`, explicit script/style/frame host allowlists, and the non-nonce lockdown directives (`object-src`, `base-uri`, `form-action`, `frame-ancestors`). `'unsafe-inline'` is still required for `script-src`/`style-src` — see Remaining Items
2. **✅ DONE**: Rate limiting is now enforced at the proxy layer across all web/API routes
3. **✅ DONE**: dependency audit is enforced, not advisory — `npm run audit:gate` fails on any high/critical production advisory outside the dated allowlist (see Remaining Items for the current counts and the one unresolved advisory)
4. **P0**: Deploy with `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to enable global Redis-backed rate limiting on Vercel
5. **✅ DONE**: Added 75 new unit tests covering payment fee math, money precision, support message validation, MFA status shaping, and axe-core contract
6. **✅ DONE**: Bundle analyzer integrated (`@next/bundle-analyzer`) — run `npm run analyze` to inspect bundle composition
7. **✅ DONE**: Playwright E2E smoke tests added (`playwright-test/tests/smoke.spec.ts`) — 7 tests covering pages, API health, headers, and auth redirects
8. **✅ DONE**: CI enhanced with a single Node 24 lane, coverage reporting, E2E job, rules job, and a weekly a11y/security audit workflow
9. **✅ DONE**: Node 24 pinned in `.nvmrc`, the Dockerfile and CI; `engines` requires >=22.12 as a supported floor
10. **✅ DONE**: ESLint accessibility rules enabled (`jsx-a11y/*`) — alt text, anchor content, ARIA props, heading content
11. **✅ DONE**: Production startup warning emits if Redis rate limit store is missing
12. **✅ DONE**: Removed 18MB `file_list.txt` artifact from repository root
13. **✅ DONE**: Documentation added — `CONTRIBUTING.md` (dev setup, testing, PR standards), `CHANGELOG.md` (structured change tracking)
14. **✅ DONE**: Removed unused `gsap` dependency (~35KB gzipped, zero imports found in `src/`)
15. **✅ DONE**: axe-core lazy-load hook (`axeScan.ts`) + contract tests for runtime accessibility scanning
16. **✅ DONE**: GlobeDashboard wrapped in `<Suspense>` with accessible loading placeholder
17. **Medium-term**: Run `npm run analyze` to identify heavy bundles (three.js) for code-splitting opportunities
18. **Medium-term**: Add live axe-core scans to key landing-page components by calling `useEffect(() => runAxeScan(), [])` in layout/page files
19. **Ongoing**: Monitor npm advisories and regularly audit dependencies

## Files Modified
- `src/proxy.ts` — **Updated**: applies the full `SECURITY_HEADERS` map (CSP, HSTS, Permissions-Policy) + rate limiting for all web/API routes via the request proxy
- `src/lib/securityHeaders.ts` — **Updated**: production CSP drops `'unsafe-eval'`, narrows `connect-src` from a blanket `wss: https:` to the Firebase socket hosts plus named API origins, allowlists the third-party script/style/frame hosts explicitly, and adds the non-nonce lockdown directives. `'unsafe-inline'` remains in `script-src`/`style-src` because prerendered pages ship their hydration bootstrap inline (pinned by `securityHeaders.test.ts`), with `script-src-attr 'none'` and `base-uri 'none'` bounding what that allowance can reach; unused hosts were dropped and the `SECURITY_HEADERS` fallback now derives from the same two builders
- `src/hooks/useSupport.ts` — **Fixed**: added eslint-disable for legitimate early-return setState pattern
- `src/hooks/useCustomerSupport.ts` — **Fixed**: added eslint-disable for legitimate state-sync in effect
- `next.config.ts` — **Updated**: added `@next/bundle-analyzer` integration (enabled via `ANALYZE=true`)
- `tsconfig.json` — **Updated**: type-checks the app, the shared packages and `playwright.config.ts` (an earlier revision excluded the Playwright config; that exclusion was removed)
- `eslint.config.mjs` — **Updated**: added accessibility rules (`jsx-a11y/*`) on top of next's built-in a11y integration
- `package.json` — Added scripts: `analyze`, `test:e2e`, `test:e2e:ui`; `engines` requires Node >= 22.12
- `.nvmrc` — **New**: pinned Node.js v24 for consistent local/CI environments
- `SECURITY_AUDIT.md` — Updated status and recommendations
- `.github/workflows/ci.yml` — Enhanced: test coverage reporting, multi-Node matrix (18/20/22), E2E Playwright job
- `playwright.config.ts` — **New**: Playwright config with Chromium project and webServer auto-start
- `playwright-test/tests/` — E2E specs: smoke, hydration, sitemap, signed-in smoke, checkout/wallet/admin-refund contracts (money-path authorization and validation), plus the staging-only refund chain
- `src/config/env/index.ts` — **Updated**: added `warnOnMissingRateLimitStore()` startup warning for production without Redis
- `src/app/api/support/[ticketId]/message/route.ts` — **Updated**: message trimmed once before validation; `rawMessage` variable used consistently
- `CONTRIBUTING.md` — **New**: contribution guidelines, dev setup, testing docs, PR standards, security reminders
- `CHANGELOG.md` — **New**: structured changelog tracking all P0/P1/P2 improvements in this hardening cycle
- `src/lib/validation.test.ts` — **New**: 23 tests covering all input schemas (email, phone, money, ID, UUID, message, name, enums, body schemas, injection/traversal prevention)
- `src/lib/auth.test.ts` — **New**: 11 tests covering auth helpers (extractAuth, verifyIdToken, requireAuth)
- `src/lib/payment.test.ts` — **New**: 7 tests for PayPal fee math and money precision
- `src/lib/supportRoute.test.ts` — **New**: 11 tests for support message validation and role checks
- `src/lib/mfaStatus.test.ts` — **New**: 9 tests for MFA credential reading, TOTP detection, and phone masking

## Hardening pass (current)

Fixes applied after the original report, with the tests that now lock them in:

| Area | Was | Now |
|------|-----|-----|
| Route classification | `validateRouteClassification()` was an empty stub; `/api/auth/login-intent`, `/api/auth/password-leak-check`, `/api/csp-report`, `/api/send-email`, `/api/whatsapp` and `/api/compliance` were unclassified, so anonymous sign-in was 401, CSP reports were dropped and admin routes answered 500 `ROUTE_UNCLASSIFIED` | Table lives in `src/config/routeAuth.ts`; `src/config/routeClassification.ts` enumerates every `route.ts` and throws at boot (`routeClassification.test.ts`) |
| Right to erasure | `adminAuth.deleteUser` was commented out and `requests` were never touched, so an erased user could still sign in and their name/email/address stayed queryable | Auth user deleted last, requests anonymised, real audit id threaded through, failures recorded and returned as 500 (`user/erase/route.test.ts`) |
| Wallet top-up | A capture could succeed while the credit failed; every retry returned ORDER_ALREADY_CAPTURED and the customer was told the payment failed | `capturePending` written before PayPal, duplicate captures reconciled from the order, 409 `CAPTURE_PENDING_RECONCILIATION` when the lookup fails |
| R2 inspection photos | Any signed-in account could upload into another customer's request folder or exchange a leaked key for a signed URL | `src/lib/r2Access.ts`: owner or admin only, same 404 for missing and not-owned (`r2Access.test.ts`, `tests/rules` suite) |
| Firestore rules | `supportTickets` create accepted any payload with the caller's customerId (born-resolved, self-assigned); `notifications` create accepted any type and size; `supportMessages` create required a field the client never sends, so every customer message was denied; `refundRequests` had a rule for a collection nothing uses | Creates pinned to the documented payloads with `createdAt == request.time`, ownership derived from the parent ticket, `refundRequests` removed (default deny) — verified by the emulator suite |
| CSP reporting | `/api/csp-report` was customer-classified despite browsers sending no Authorization header | `public`, with a bounded body and Sentry forwarding |
| Image hosts | No `images.remotePatterns`, so Google avatars from Firebase `photoURL` were refused at render time | `lh3.googleusercontent.com` allowed; presigned R2 URLs marked `unoptimized` instead |
| Observability | Sentry configs existed but nothing initialised them | Server/edge/client init via instrumentation, `onRequestError`, build wrapper gated on DSN + auth token |
| Dead workflow | `expire-quotes-cron.yml` was UTF-16, which GitHub cannot parse — the hourly job never ran | Re-encoded UTF-8/LF, and `npm run check:workflows` (CI) rejects BOMs, NUL bytes and invalid UTF-8 |
| Runtimes | Docker image pinned Node 22 while `.nvmrc` and CI used 24 | Dockerfile on `node:24-alpine`; `engines` >=22.12 documents the supported platform floor |
| Dependency audit | CI ran `npm audit --audit-level=moderate`, which was red on the then-current highs with no fix available — an unpassable gate | `scripts/audit-gate.mjs` gates the production view at high/critical with a dated, reasoned allowlist and fails once an entry expires (`npm run audit:gate`) |
| Dead money writers | Client-side wallet and request writers that `firestore.rules` denies were still exported, and feature barrels re-exported `server-only` modules | Writers, their tests and the mixed barrels removed; feature services are imported directly (`features/README.md`) |

---
*Last updated: hardening pass on route classification, erasure, wallet capture, R2 access, Firestore rules, Sentry, workflow encoding, the CI audit gate, dead-code removal, and the CSRF decision (Bearer token, origin allowlist, `Sec-Fetch-Site` on mutations, `SameSite=Strict` MFA cookie and CSP `form-action`; no token module, and `src/lib/csrf.ts` is absent).*

### 4. Payment Order Refusals

- Every refusal in `/api/paypal/capture-order` now returns the same generic 403 body (`{"success": false, "error": "This payment could not be verified."}`), so an unknown `orderID` cannot be distinguished from a real one — the caller cannot act on the distinction anyway, and all six refusal reasons resolve to "do not capture this". This closes the enumeration oracle leak that previously told callers which `orderID`s existed in `paypalPaymentOrders`.

