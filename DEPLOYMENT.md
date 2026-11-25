## Production Deployment Checklist

> **Operations:** schema migrations, backups/disaster recovery, rollback and
> monitoring are documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

### Required Vercel Environment Variables

Set these in your Vercel project settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Yes | Production URL (e.g., `https://shipin-psi.vercel.app`) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase client config |
| `FIREBASE_ADMIN_PROJECT_ID` | Yes | Server-only (not exposed to client) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Yes | Server-only (not exposed to client) |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Yes | Server-only (not exposed to client) — keep `\n` as literal newlines |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Yes | PayPal client SDK |
| `PAYPAL_CLIENT_ID` | Yes | Server-side PayPal API |
| `PAYPAL_CLIENT_SECRET` | Yes | Server-side PayPal API |
| `PAYPAL_ENV` | Yes | `live` or `sandbox` |
| `PAYPAL_WEBHOOK_ID` | Yes | PayPal webhook verification |
| `RESEND_API_KEY` | Yes | Transactional emails |
| `SMTP_EMAIL` / `SMTP_PASSWORD` | Fallback | SMTP fallback |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | Yes | Cloudflare R2 uploads |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Optional | WhatsApp Business API |
| `MFA_SESSION_SECRET` | **Yes** | Signs admin MFA session cookies (min 32 chars). Production boot fails without it |
| `BREACH_ALERT_WEBHOOK_URL` | Optional | Slack/incident webhook pinged for a critical data breach |
| `UPSTASH_REDIS_REST_URL` | **Yes** | **Global rate limiting. The server refuses to start without it** |
| `UPSTASH_REDIS_REST_TOKEN` | **Yes** | **Global rate limiting. The server refuses to start without it** |

The startup check also refuses to boot production with an emulator redirect
(`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_EMULATOR_HUB`
or their `NEXT_PUBLIC_` twins) in the environment: the server would read and
write a throwaway emulator instead of live Firestore. The local E2E suite opts
out with `EMULATOR_GUARD_OPTIONAL=1`.
### Retention cleanup

`executeRetentionCleanup()` deletes documents past their processing-register
retention period, and defaults to a dry run. Schedule the handler with
`?dryRun=false` only after reading one dry-run report: it skips anything under a
legal/litigation/audit hold, anything whose owner has an open rights request,
any `users` document whose account is not closed, and it deletes the Firebase
Auth account before the profile so no sign-in is ever left without a record. If
Auth refuses, the profile is kept for the next run and an entry is written to
`retentionFailures/{uid}` (attempts, last error). Clear that collection's entries
only after fixing the cause. `deleteOrphanedAuthAccounts()` covers the reverse
case — an Auth account with no profile — and also defaults to a dry run, skipping
accounts younger than seven days so a signup is never raced. Deletions are batched
(100 per collection per run) and the result lists every document with the
reason it expired.

### Pre-deploy checks

These are deliberately not CI steps: each needs production credentials that CI
does not hold. Run them before promoting a deploy.

1. **App Check is actually on.** Production must set
   `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` and `APP_CHECK_ENFORCEMENT=true`.
   With enforcement off, `requireAdmin` skips the App Check check and the admin
   API gate is inert; locally `/api/health` reports
   `appCheck: { configured: false, enforced: false }`, which is expected. After
   deploying, `/api/health` must report both as `true`. The production host also
   has to be registered on the reCAPTCHA v3 key in Google Cloud Console, or the
   client cannot mint a token and requests fail with `APP_CHECK_FAILED`.
2. **Firebase authorized domains.** Google sign-in only works on hosts listed in
   Firebase Auth. Run `npm run check:authorized-domains` with the production
   `FIREBASE_ADMIN_PROJECT_ID` / `FIREBASE_ADMIN_CLIENT_EMAIL` /
   `FIREBASE_ADMIN_PRIVATE_KEY` and confirm the canonical host appears. The
   script mints a Google access token from that service account, which is why it
   is a pre-deploy step rather than a workflow.
3. **Cron alerting.** `ALERT_WEBHOOK_URL` is optional, but without it a failed
   hourly quote-expiry run only writes a job summary. The workflow now also
   emits an `::error::` annotation in that case, so configure the repository
   secret if anyone is expected to react to a missed sweep.

### Domains and origins

This app is reachable from more than one hostname, and origin handling is
explicit rather than wildcarded:

| Host | Role |
|------|------|
| `https://shipin-psi.vercel.app` | **Canonical** — use for `NEXT_PUBLIC_APP_URL`, `APP_URL`, links and passkeys. Also the code fallback (`SITE_URL_FALLBACK`) when the variable is unset |
| `https://shipin.co` | Intended long-term domain, but it answers **410 Gone** today. Do not make it canonical, and do not use it as a fallback, until hosting is live |
| `https://shipin-9576a.web.app` | Firebase Hosting alias (secondary, API access only) |
| `https://shipin-9576a.firebaseapp.com` | Firebase Hosting alias (secondary, API access only) |
| `http://localhost:3000`, `http://127.0.0.1:3000` | Local development |

- All of the hosts above are accepted by `src/lib/cors.ts`. Add or change hosts
  with `APP_ALLOWED_ORIGINS` (comma-separated) instead of editing code; the
  variable is optional and unset by default.
- **Preview deployments need no CORS configuration.** Each preview gets a generated
  hostname, so the allowlist is extended at runtime from the Vercel system
  variables `VERCEL_URL`, `VERCEL_BRANCH_URL` and
  `VERCEL_PROJECT_PRODUCTION_URL`. That is deliberately not a `*.vercel.app`
  wildcard, which would trust every unrelated project hosted there. Note that
  `NEXT_PUBLIC_APP_URL` stays the canonical domain on previews, so links in
  emails sent from a preview still point at production.
- Set both `NEXT_PUBLIC_APP_URL` and `APP_URL` to the canonical domain users
  actually visit. They build verification links and the WebAuthn relying party,
  so a mismatch sends users to the wrong site and breaks passkeys.
- WebAuthn cannot span domains. `vercel.app`, `web.app` and `firebaseapp.com`
  are separate registrable domains, so a passkey registered on one is invalid
  on another. **Vercel is the canonical host**, so the relying party is
  `shipin-psi.vercel.app`; passkeys registered on the Firebase aliases will not
  validate. If a custom domain is added later, migrate MFA to it deliberately
  (existing passkeys have to be re-registered).
- `firebase.json` configures Firestore rules and indexes only. Firebase
  Storage is not used (files live in Cloudflare R2), so there are no Storage
  rules to deploy and the client config carries no `storageBucket`. There is
  no `hosting` block, so the Firebase Hosting URLs do not serve this Next.js
  app yet; they need a Hosting target (static export or a Cloud Run / Functions
  backend).

### Firebase Auth on preview deployments

CORS being automatic does **not** make preview URLs usable for Google sign-in.
`signInWithPopup` — and the `signInWithRedirect` fallback in
`src/app/login/LoginClient.tsx` — only run on hostnames listed in **Firebase
Console → Authentication → Settings → Authorized domains**. Any other host
fails with `auth/unauthorized-domain`, which the login page maps to a support
message.

Which flows need the preview host authorized:

| Flow | Preview host must be authorized? |
|------|----------------------------------|
| Google sign-in (popup or redirect) | **Yes** |
| Email + password sign-in / registration | No |
| Email-verification links | No — `NEXT_PUBLIC_APP_URL` stays canonical, so links point at production. Only a preview that overrides `NEXT_PUBLIC_APP_URL` needs its own host, otherwise `sendEmailVerification` fails with `auth/unauthorized-continue-uri` |
| CORS, rate limiting, the App Check header | No — handled per request |

Every Vercel deployment gets its own host
(`shipin-psi-<hash>-<team>.vercel.app`), and the authorized-domain list holds
exact hostnames: **there is no wildcard entry**, and `*.vercel.app` would be
wrong anyway because it would authorize every unrelated project on that domain.
Authorizing each commit URL is therefore not practical.

**Use the branch alias instead.** Vercel keeps
`shipin-psi-git-<branch>-<team>.vercel.app` stable across deployments of a
branch, so it only has to be added once:

1. Vercel → Project → Domains: copy the `git-<branch>` domain for the branch
   used for auth QA.
2. Firebase Console → project `shipin-9576a` → Authentication → Settings →
   Authorized domains → **Add domain**.
3. Enter the **bare hostname**: no scheme, no path, no port.
4. Open the alias in a fresh tab and sign in with Google; the error should be
   gone. The change can take a minute to propagate.
5. Remove the host when the branch is deleted. An authorized host can run OAuth
   against the project, so stale preview hosts are unnecessary surface.

Ephemeral per-commit URLs still cannot do Google sign-in. Use the branch alias,
the canonical domain, or email + password for those.

**Automating the list** (optional). The Firebase Admin SDK does not expose
authorized domains; the Identity Toolkit Admin API does. `PATCH` replaces the
whole field, so read the current list first and write it back with the new host:

```bash
PROJECT=shipin-9576a
HOST=shipin-psi-git-develop-<team>.vercel.app
TOKEN="$(gcloud auth print-access-token)"   # needs the cloud-platform scope
URL="https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config"

DOMAINS="$(curl -sf -H "Authorization: Bearer ${TOKEN}" \
  -H "x-goog-user-project: ${PROJECT}" "${URL}" | jq -c '.authorizedDomains // []')"

BODY="$(jq -c --arg h "${HOST}" \
  'if any(.[]; . == $h) then . else . + [$h] end | {authorizedDomains: .}' \
  <<<"${DOMAINS}")"

curl -sf -X PATCH -H "Authorization: Bearer ${TOKEN}" \
  -H "x-goog-user-project: ${PROJECT}" -H "Content-Type: application/json" \
  -d "${BODY}" "${URL}?updateMask=authorizedDomains"
```

This is the same read-modify-write the Firebase CLI performs when it authorizes
a Hosting preview channel.

Two adjacent settings are separate from this list:

- If `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is ever pointed at a custom host instead
  of the project's `firebaseapp.com` domain, that host must be authorized **and**
  the Google OAuth client needs `https://<host>/__/auth/handler` as a redirect
  URI. Nothing to do today: the app keeps the default `authDomain`.
- App Check is not covered by this list. A reCAPTCHA v3 site key only works on
  the domains registered on the key in Google Cloud Console. With
  `APP_CHECK_ENFORCEMENT=true`, a preview host must be added there too, or the
  client cannot mint a token and requests fail with `APP_CHECK_FAILED`.

### SMS MFA (Identity Platform)

SMS second factors are issued and verified by Firebase Identity Platform, not
by this app. The server trusts the `firebase.sign_in_second_factor` claim on a
verified ID token, so no SMS secret, hashed code, or delivery provider lives in
this codebase.

Setup, once per Firebase project:

1. Upgrade the project to Identity Platform (Firebase console → Authentication
   → Identity Platform → Upgrade). Identity Platform requires the Blaze
   (pay-as-you-go) plan.
2. Authentication → Sign-in method → Phone: enable it.
3. Authentication → Settings → SMS region policy: the default denies every
   region. Allow only the countries you actually deliver to.
4. Authentication → Settings → Authorized domains: list every origin that serves
   the app, including preview domains that should be able to enrol or sign in
   with SMS.
5. Accounts using SMS need a verified email; the app already requires one for
   admins.

What to expect operationally:

- Google sends the message, so delivery failures show up as Firebase errors
  (`auth/quota-exceeded`, `auth/too-many-requests`), not in app logs.
- The invisible reCAPTCHA is rendered by the SDK. The CSP already allows
  `https://www.google.com/recaptcha/`, `https://recaptcha.google.com` and
  `https://www.gstatic.com`; keep them if the CSP is edited.
- Default quotas are 10 SMS per phone number per hour and 50 enrolment starts
  per minute per IP. Message pricing applies after the first 10 messages per day
  per project; check the Firebase pricing page before launch.
- Authentication → Phone numbers for testing registers fake numbers for QA
  without sending real SMS or spending quota.
- `POST /api/admin/users/[uid]/mfa/reset` clears Firebase factors as well as the
  Firestore ones, so a locked-out admin can re-enrol.

Local development can exercise the UI and the server-side 401/403 paths, but a
real end-to-end SMS sign-in has to be verified on a deployed origin.

### Enabling Global Rate Limiting (Upstash Redis)

1. **Create an Upstash Redis database**:
   - Go to [console.upstash.com](https://console.upstash.com)
   - Click "Create Database" → Select region → "Global" or closest to your users
   - Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

2. **Add to Vercel**:
   - Vercel Dashboard → Project → Settings → Environment Variables
   - Add both variables for **Production**, **Preview**, and **Development** environments

3. **Verify it works**:
   - Deploy to Vercel
   - The deploy should stay up: a production build with either variable missing now exits at startup with `[ShipIN] FATAL: Missing required production environment variables: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN`, because a deployment that cannot enforce global limits must not serve traffic.
   - Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) should appear on responses
   - `/api/health` should report the store as configured, not `degraded`

   `RATE_LIMIT_STORE_OPTIONAL=1` bypasses that startup check. It exists only for the local/CI E2E suite, which builds production and runs against a throwaway database. Never set it on Production or Preview.

### App Check: quota, billing, and the emergency escape hatch

API routes verify a Firebase App Check token when enforcement is on. The client
mints that token with reCAPTCHA Enterprise, and reCAPTCHA Enterprise calls
`assessment.create()` roughly every half token-TTL (default TTL is one day, so
about two assessments per active user per day — **not** one per API request;
backend verification is free).

**Quota behaviour.** Projects without billing get 10,000 assessments per month
per *organization*. Past that, `CreateAssessment` fails closed and every client
stops being able to mint a token: sign-in still works (it talks to Firebase Auth
directly and never touches these routes), but each API call is rejected with
`APP_CHECK_FAILED`.

**Billing is the fix, not a cost risk.** Attaching a billing account to the
Google Cloud project moves the tier to Premium: assessments 10,001–100,000 in a
month are a flat $8, then $1 per 1,000. At ShipIN's volume the realistic bill is
$0–8/month, and the failure mode changes from "hard outage until the 1st" to
"keeps working". Do this before launch rather than after an outage.

**How the outage is detected.** `/api/health` reports `degraded` with
`appCheck.rejectionsLast10Min` and a warning once rejections cross the spike
threshold, and one Discord message is POSTed per five-minute window
(`lib/appCheckMetrics.ts`). Sign-in keeps working during the outage, so user
reports alone would be misleading — trust the probe.

**Alert channel.** Set `APP_CHECK_ALERT_WEBHOOK_URL` in Vercel to a Discord
webhook URL (Server Settings → Integrations → Webhooks → Copy Webhook URL).
Where the dedicated variable is unset, `BREACH_ALERT_WEBHOOK_URL` is used
instead; with neither set the alert is a no-op and only the health probe
reports the outage. The POST is bounded by a five-second timeout and its
failures are logged, never propagated — a broken webhook cannot make
`/api/health` fail. `.env.example` does not ship this variable; add it to
Vercel directly.

**Emergency escape hatch.** To restore service immediately while the quota
keeps failing:

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Set `APP_CHECK_ENFORCEMENT=false` for Production
3. Redeploy (env changes need a new deployment to take effect)

This turns the server-side gate off: API routes stop requiring a token, so the
app works again at the cost of bot protection until the quota resets or billing
is attached. It is a deliberate, documented trade — never leave it off as a
permanent state. Set it back to `true` (or remove the variable, since a
production build with a site key configured enforces by default) once reCAPTCHA
is healthy again.

Do not enable App Check Replay Protection on high-traffic routes: it forces a
fresh assessment on every request and would multiply quota use by orders of
magnitude.

### Verifying Rate Limiting

```bash
# Test rate limiting locally (with UPSTASH vars set)
curl -I http://localhost:3000/api/tracking/test

# Check headers:
# X-RateLimit-Limit: 30
# X-RateLimit-Remaining: 29
# X-RateLimit-Reset: <timestamp>
```

### Bundle Analysis

Run locally to inspect bundle composition:

```bash
npm run analyze
```

This opens an interactive treemap. Look for:
- `three` / `react-globe.gl` → Consider `lazy` + `ssr: false` (already done)
- `framer-motion` → Consider if only used for simple animations
- Duplicate dependencies → Check for multiple versions of same package

### E2E Test Coverage

`apps/web/scripts/e2e-local.mjs` (`npm run test:e2e:local`) is the reference local spec set,
and the CI `e2e` job runs the same files, so a documented suite cannot rot unexecuted.

| Test File | Coverage | Runs |
|-----------|----------|------|
| `smoke.spec.ts` | Public pages, API health, security headers, auth redirects | local + CI |
| `hydration.spec.ts` | The production build actually hydrates | local + CI |
| `sitemap-check.spec.ts` | `robots.txt` and `sitemap.xml` | local + CI |
| `checkout-flow.spec.ts` | PayPal order routes: anonymous 401, validation 400 | local + CI |
| `wallet-topup.spec.ts` | Wallet top-up routes: anonymous 401, bad amount 400, unknown id 404 | local + CI |
| `admin-refund-local.spec.ts` | Refund authorization on the emulators: 401 / 403 / 404, no money moved | local + CI |
| `signed-in-smoke.spec.ts` | Signed-in admin area and dashboard reads | `test:e2e:signed-in` + CI staging |
| `admin-refund.spec.ts` | Full refund chain, real PayPal sandbox | CI staging only |
| `auth-flow.spec.ts` | Public auth pages | Manual only — its 45s wait exceeds Playwright's 30s default timeout, so it is not wired into a runner yet |

### Integration Test Coverage

| Test File | Coverage |
|-----------|----------|
| `login-intent/route.test.ts` | Rate limiting, auth headers, 429 responses |
| `tracking/[trackingId]/route.test.ts` | Public access, 404 handling, Cache-Control |
| `support/[ticketId]/message/route.test.ts` | Auth checks, role enforcement, validation |
| `paypal/create-order/route.test.ts` | Auth, validation, 404 handling |

### Monitoring and Alerting

There is no third-party error-reporting SDK in this deployment. What exists:

| Signal | Where it comes from |
|--------|--------------------|
| Readiness / degraded state | `/api/health` — rate-limit store, tracking feed, App Check configuration and rejection count |
| App Check quota outage | One Discord message per five-minute window (`APP_CHECK_ALERT_WEBHOOK_URL`, falling back to `BREACH_ALERT_WEBHOOK_URL`) |
| CSP violations | Logged by `/api/csp-report` (no forwarding configured) |
| Rate-limiter store failures | `error`-level log line with the limiter name, plus the per-IP counters `/api/health` reads |

Point an uptime monitor at `/api/health` and alert on a non-`healthy` status; that probe is the only signal that does not depend on a webhook being configured.

### Docker Deployment

Build and run locally:
```bash
# Build image
docker build -t shipin .

# Run container
docker run -p 3000:3000 \
  -e UPSTASH_REDIS_REST_URL=... \
  -e UPSTASH_REDIS_REST_TOKEN=... \
  shipin
```

### Accessibility Audit

- Run locally: `npm test -- src/lib/axeScan.test.ts`
- CI runs it on every push: `src/lib/axeScan.test.ts` and `axeScan.test.tsx` match the suite's `src/**/*.test.{ts,tsx}` include, so the `Tests` job covers them
- Add `runAxeScan()` to any new page/component for runtime scans

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update with audit
npm audit fix

# Full update (careful with major versions)
npm update
npm test
npm run lint
npm run build
```

---

*Last updated: P0/P1/P2 hardening complete (audit gate, dead code, App Check and authorized-domain pre-deploy checks)*