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
| Alert webhook (any of `APP_CHECK_ALERT_WEBHOOK_URL`, `ERROR_ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_URL`, `BREACH_ALERT_WEBHOOK_URL`) | **Yes, at least one** | Operator channel for App Check outage, payment drift, MFA revocation-store failure and cron failure. **Production boot fails without one** |
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
3. **Cron alerting.** Once an alert webhook is configured (now required, see
   the env table), a failed
   hourly quote-expiry run only writes a job summary. The workflow now also
   emits an `::error::` annotation in that case, so configure the repository
   secret if anyone is expected to react to a missed sweep.
4. **Provider contract secrets.** `provider-contract-daily.yml` runs the suites
   in `apps/web/tests/contract/` once a day against the real providers. Both
   jobs *fail* rather than skip when their secrets are missing, because a green
   daily run that verified nothing is the failure mode they exist to catch.

   | Secret | What it is |
   | --- | --- |
   | `PAYPAL_CONTRACT_CLIENT_ID` / `PAYPAL_CONTRACT_CLIENT_SECRET` | A **sandbox** application, never live. Creating an order charges nothing and the suite only asserts PayPal's failure paths. |
   | `R2_CONTRACT_ACCOUNT_ID` / `R2_CONTRACT_ACCESS_KEY_ID` / `R2_CONTRACT_SECRET_ACCESS_KEY` | An R2 token scoped to Object Read & Write on **one** bucket, not the production token. |
   | `R2_CONTRACT_BUCKET` | A bucket for the daily write/delete under `contract/`; a dedicated bucket keeps the test object out of the real one. |

   The Firebase side needs no secret: `npm run test:admin` drives the suite in
   `apps/web/tests/admin-contract/` against the emulators (real Firestore and
   Auth behaviour, no network), and `npm run test:rules` drives the security
   rules. App Check verification is exercised by the signed-in staging E2E,
   which exchanges a real debug token with the Firebase project.

### Domains and origins

This app is reachable from more than one hostname, and origin handling is
explicit rather than wildcarded:

| Host | Role |
|------|------|
| `https://shipin-psi.vercel.app` | **Canonical** — use for `NEXT_PUBLIC_APP_URL`, `APP_URL` and links. Also the code fallback (`SITE_URL_FALLBACK`) when the variable is unset |
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
  actually visit. They build verification links and password-reset links, so a
  mismatch sends users to the wrong site.
- **Security keys and passkeys are withdrawn** (an authenticator app is the only
  second factor today), so there is no relying-party ID to configure and no
  credential that a domain move can invalidate. Moving to a custom domain still
  needs the Firebase Auth authorized-domain list, the App Check reCAPTCHA key's
  domain allowlist and both URL variables updated — see `docs/OPERATIONS.md` §4a.
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

### CSP: how each page gets a strict script policy without slowing down

No page runs inline scripts. Two mechanisms get there, and neither costs a
per-request render.

**Prerendered pages (32 with HTML).** Their bootstrap is written into the HTML at
build time, so a per-request nonce can never match it. `npm run build` instead runs
`scripts/inject-static-csp.mjs`, which hashes that page's own inline scripts and
writes a `<meta http-equiv="Content-Security-Policy">` containing the hashes and no
`'unsafe-inline'`. Browsers intersect header and meta policies, so the header stays
as a permissive floor and the page narrows itself.

The floor is left permissive on purpose: if the step ever fails to run, pages fall
back to the old policy rather than to a blank page. The step fails the build when it
instruments nothing, when a page has no `<head>`, or when a page's own inline script
is not covered by a hash — that last one is checked by re-reading the file, because a
gap there shows up as one blocked script on one page in one browser and nowhere else.

Both copies of the HTML are instrumented: `.next/server/app` (what Vercel serves) and
the traced standalone tree (what `npm start` serves). Measured: instrumenting only the
first left the standalone path on the permissive policy.

**Pages that load the PayPal SDK are the exception, and it is a real weakening.**
`/payment/[id]`, `/requests/[id]` and `/requests/[id]/invoice`
keep `'unsafe-inline'` for scripts. The SDK injects its own inline bootstrap at
runtime, after CSP is evaluated; its content depends on the SDK version, so it cannot
be hashed the way the theme bootstrap is, and a static page cannot carry a per-request
nonce. Measured: with the strict policy in place the browser refuses it with
"Executing inline script violates the following Content Security Policy directive".

What bounds it: `script-src-attr 'none'` still blocks event-handler attributes, and
those pages render no user-controlled HTML. What it means: on those three routes an
injected inline script would run. `src/config/paypalScriptRoutes.ts` is the single
list, and `injectStaticCsp.test.ts` fails if a page that imports the PayPal provider
is missing from it.

**Rendered-on-demand pages** (`/track/[trackingId]`, `/requests/[id]`,
`/payment/[id]`, `/shipment/[id]`, `/requests/[id]/invoice`,
`/admin/requests/[requestId]`). `proxy.ts` mints a nonce per request and Next stamps
its own scripts with it, so the header itself has no `'unsafe-inline'`.

Which page is which is not written by hand. The generator reads the build's own
`app-path-routes-manifest.json` and `prerender-manifest.json` and writes
`src/config/dynamicRoutes.generated.ts`. **The build fails when that file changes**,
because the proxy in that same build compiled against the previous list — a route
that just became prerendered would still get a nonce and lose the scripts baked into
its HTML. Commit the regenerated file and build again.

Verified in a browser against a production build: prerendered pages hydrate with the
strict meta in place (500+ React fibers on the landing page), the theme bootstrap
runs, and no script is refused.

### Log aggregation

The app writes one JSON line per entry to stdout, and `warn`/`error` to stderr
(`apps/web/src/lib/logger.ts`), with caller context nested under `context` so a field
can never overwrite `level`, `message` or `timestamp`. Nothing needs configuring for
the app to run; this is only about being able to query those lines afterwards.

**On Vercel (the deployment that exists).** Vercel captures stdout, and its own log
view is the first place to look. That view is short-lived, so for retention or search
use a **Vercel Log Drain** (Pro feature) pointed at whichever sink you prefer - Axiom,
Better Stack, Grafana Cloud Loki. All of them read newline-delimited JSON without a
parser, which is why the logger emits that rather than free text.

There is no self-hosted shipper in this repository: a Vector-plus-Loki stack was tried
and removed, because nothing here runs in containers and it could never see Vercel's
function logs anyway. Alerting does not depend on it either - `/api/health` plus the
mandatory alert webhook (`docs/OPERATIONS.md` §4) is the path that reaches a human.

**If you ever containerise.** Add a shipper back at that point, not before: point it at
the container log files, parse each line as JSON, and promote `context.service` to a
label. Unbounded values (message text, request ids) as Loki labels are what make that
install fall over.

### India Post tracking (carrier feed)
### India Post tracking (carrier feed)

Customer tracking has two states and both are honest about which one is running.

**Configured.** The feed is live when all three are set:

| Variable | Where it comes from |
| --- | --- |
| `INDIA_POST_TRACKING_URL` | The CEPT tracking endpoint issued with your contract (behind the Azure proxy, not the public post office page) |
| `INDIA_POST_CLIENT_ID` | CEPT API credential |
| `INDIA_POST_CLIENT_SECRET` | CEPT API credential |

**Not configured.** `getTrackingProvider()` falls back to a synthetic feed,
`/api/health` reports `degraded`, and the startup log names exactly which variable is
missing. The customer page discloses that the carrier feed is not connected and that
the scans below it are an illustrative sample.

What the fallback deliberately does **not** do:

- it does not write synthetic scans into `tracking.events`, because they would
  outlive the placeholder — once credentials arrive, the merge keeps stored history
  and adds real scans, so invented events would sit in the customer's timeline for
  the life of the parcel;
- it does not advance the request. Closing the last leg and moving the status
  machine is a real carrier's job, so a synthetic `delivered` status cannot mark a
  parcel delivered.

**Verifying the feed once credentials are set.** Open a real parcel's tracking page
and confirm the response says `source: "carrier"` (a placeholder response says
`placeholder` and carries the disclosure notice). If it still says placeholder, the
credentials are incomplete — `/api/health` names the missing one under
`trackingWarning`.

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

### Rate-limit keys: the trust boundary (`TRUST_PROXY`)

Limits are charged to a signed-in account (`u:<uid>`) and, because the token is
only decoded at the proxy, to a per-address ceiling of 10× the account limit so
that minting a token per request cannot buy unlimited budget. Anonymous traffic
is charged to the client address — but only an address this deployment can
trust: `x-forwarded-for` is read only when `VERCEL=1` (the platform overwrites
it) or `TRUST_PROXY=1` (your reverse proxy is the only path in and sanitises the
chain). See `apps/web/src/lib/clientIp.ts`.

What `TRUST_PROXY=1` reads, in order: `x-real-ip` (first address), then the
**last** hop of `x-forwarded-for`. The last hop is the correct choice for a
single proxy: the leftmost value is whatever the client claimed, and each proxy
appends the address it saw, so the rightmost entry is the one your own proxy
vouches for — a client cannot forge it short of compromising the proxy. With a
chain of two or more proxies (say Cloudflare in front of nginx) the last hop is
the nearest proxy's upstream instead: still unspoofable, but every client
arrives as one of a few edge addresses and shares its rate-limit bucket. If you
need per-client keys behind a chain, set `x-real-ip` on the outermost proxy (it
is read first) or have the inner proxy overwrite `x-forwarded-for` rather than
append to it.

**That has one failure mode worth knowing before it bites.** A self-hosted
deployment with neither variable set cannot identify callers, so every visitor
shares one bucket — 30 API requests a minute for the whole site. The app boots
with a `[clientIp] neither VERCEL=1 nor TRUST_PROXY=1 is set` warning in the log
for exactly this reason. Fix and redeploy:

| Deployment | Set |
| --- | --- |
| Vercel | nothing (`VERCEL=1` is set by the platform) |
| VM behind nginx, Caddy, ALB, or Cloudflare Tunnel | `TRUST_PROXY=1` |
| Published directly, no proxy | leave both unset; keep the warning in mind and put a proxy in front before real traffic |

Never set `TRUST_PROXY=1` when the app is directly reachable: the header then
becomes client-supplied and a caller can mint a fresh rate-limit bucket per
request.

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

**The alert channel itself is reported.** `/api/health` publishes
`alerting.webhook` (`dedicated`, `breach` or `none`), and a production boot with
neither variable set logs a warning. With no webhook, an App Check quota outage
shows up only as a `degraded` probe, so the monitor in that state is the whole
safety net — alert on it.

**Quick way to prove the channel works.** Set `APP_CHECK_SPIKE_THRESHOLD` to
`1` in a throwaway branch, request an App Check-protected route without a token
once, and call `/api/health`: the message should arrive within a second, with
the rejection count, the environment and the `APP_CHECK_ENFORCEMENT=false`
remediation. Then revert the threshold.

### Accessibility Audit

- Run locally: `npm test -- src/lib/axeScan.test.ts`
- CI runs it on every push: `src/lib/axeScan.test.ts` and `axeScan.test.tsx` match the suite's `src/**/*.test.{ts,tsx}` include, so the `Tests` job covers them
- Add `runAxeScan()` to any new page/component for runtime scans

### Updating Dependencies

Every direct dependency is pinned to an **exact** version — no `^` or `~`. A
range lets a registry publish change what CI builds without any commit doing
it, which is the same moving-target problem `trufflehog@main` had, just slower.
The versions worth watching (TypeScript, Next, React, Vitest, ESLint) are
already on current majors, so the pin costs nothing today and buys
reproducibility: `package-lock.json` and the manifests can no longer disagree
about what "the same install" means.

When an upgrade is wanted, it is a deliberate change, not a float:

```bash
# Discover what is behind
npm outdated

# Upgrade in a branch, one dependency at a time — never on main, never in bulk
git checkout -b deps/<name>-<version>
npm install <name>@<version>          # or npm install <name>@latest to preview
npm test && npm run lint && npm run build
npm run test:e2e:local                # for anything the runtime touches
```

`npm audit fix` may still be run when a security advisory lands, but it gets
the same branch-and-gate treatment: it edits the manifest, so it can change
what CI builds. The overrides at the root of `package.json` (`@grpc/grpc-js`,
`minimatch`, `jose`) exist to hold transitive dependencies at patched
versions — when bumping one, bump it to the version you actually installed,
and note the advisory in the commit message.

---

*Last updated: P0/P1/P2 hardening complete (audit gate, dead code, App Check and authorized-domain pre-deploy checks)*