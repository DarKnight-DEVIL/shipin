# ShipIN

International shipping platform for creating shipping requests, receiving quotes, paying (PayPal or
wallet), and managing warehouse receiving, inspection, storage and delivery — all behind a
Firebase-authenticated customer portal and an MFA-protected admin console.

> Canonical deployment: <https://shipin-psi.vercel.app>

## Stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 16.4 (App Router, Turbopack), React 19.3 |
| Language | TypeScript 7 (strict) |
| Styling | Tailwind CSS 4, lucide-react, framer-motion |
| Auth | Firebase Auth (client) + Firebase Admin SDK (server) |
| Data | Firestore (client and admin access) |
| Payments | PayPal REST (orders + capture + webhooks), internal wallet |
| Rate limiting | Upstash Redis (`@upstash/ratelimit`) |
| Storage | Amazon S3 / Cloudflare R2 (presigned uploads) |
| Email | Resend with SMTP fallback |
| Messaging | WhatsApp Cloud API |
| Observability | `/api/health` probe, Discord webhook alerts, Vercel Analytics / Speed Insights |
| Tests | Vitest 5 + Testing Library, Playwright (E2E) |

## Project layout

```
src/
  app/            App Router pages, layouts and API route handlers
  components/      Shared UI (marketing, dashboard, admin, invoice, support)
  features/        Domain services: requests, quotes, payments, shipments,
                   warehouse, notifications, finance, admin
  hooks/           Client hooks (auth, support)
  lib/             Server/client primitives: auth, adminAuth, firebaseAdmin,
                   paypal, wallet, mfa, webauthn, rate limiting, mailer
  config/env/      Validated server and client environment access
  proxy.ts         Request proxy (security headers, rate limiting, CORS)
  types/           Shared domain types
packages/
  config           Workspace package (site URL + brand config)
```

## Prerequisites

- Node.js 24 (`.nvmrc`, CI); engines: >=22.12
- A Firebase project with Auth and Firestore enabled
- PayPal REST credentials (sandbox or live)
- Upstash Redis database — **required in production** (see Security)

## Getting started

```bash
npm ci
cp apps/web/.env.example apps/web/.env.local   # then fill in the values below
npm run dev
```

The app runs at <http://localhost:3000>.

### Environment variables

Server-side:

| Variable | Purpose |
| --- | --- |
| `FIREBASE_ADMIN_PROJECT_ID` | Admin SDK project id |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Admin SDK service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service account private key (`\n` escaped) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal REST credentials |
| `PAYPAL_ENV` | `sandbox` or `live` |
| `PAYPAL_WEBHOOK_ID` | Webhook signature verification id |
| `SMTP_EMAIL` / `SMTP_PASSWORD` | SMTP fallback for transactional mail |
| `RESEND_API_KEY` | Resend API key |
| `APP_URL` | Public origin used in emails and callbacks |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Shared rate-limit store — required in production, the server will not start without both |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Object storage |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API |

Client-side (inlined at build time):

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`NEXT_PUBLIC_PAYPAL_CLIENT_ID`.

Never commit `.env*` files that contain real credentials.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build (traced standalone `server.js`, the same entrypoint the Docker image runs) |
| `npm run lint` | ESLint |
| `npm test` | Unit/route tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with per-file coverage thresholds |
| `npm run test:security` | Focused suite: auth, MFA session, Firestore rules |
| `npm run test:rules` | Firestore rules against the emulator (needs a JDK) |
| `npm run emulators` | Firestore + Auth emulators, the Emulator UI on `localhost:4000`, and the dev server |
| `npm run test:e2e:local` | E2E against a production build + Firestore emulator (see `apps/web/playwright-test/README.md`) |
| `npm run test:e2e:signed-in` | Same, plus the Auth emulator and a seeded admin, for the sign-in spec |

Quality bar for changes: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm test`,
`npm run build`, and `npm run test:coverage` must all pass. Coverage is enforced per file
(80% lines/statements/functions, 70% branches) — not just in aggregate.

## Payments and wallet

- `POST /api/paypal/create-order` computes the amount server-side: quote total, processing fee
  (4.4% + $0.30), and any wallet balance the customer chooses to apply. The browser's claimed
  amount is only accepted if it reconciles with that calculation.
- `POST /api/paypal/capture-order` verifies the stored order, captures at PayPal, checks the
  captured amount/currency, deducts the wallet share atomically in a Firestore transaction, and
  marks the request paid. Replays are idempotent.
- `POST /api/paypal/capture-wallet-topup` credits the wallet once per capture id.
- `POST /api/webhook` verifies the PayPal signature and fails closed on verification errors.
- Refunds run through the admin routes (`refund`, `partial-refund`, `refund-offer`) and record
  wallet vs. PayPal portions separately; the wallet portion is credited transactionally and the
  request is only marked `refunded` when every portion is complete.

## Security

- **Admin MFA is mandatory.** `requireAdmin` accepts a TOTP, backup or one-time SMS code, or a
  verified elevated session cookie issued by `POST /api/auth/mfa/session`. That session also
  covers WebAuthn, which is verified there with a per-request challenge, signature and counter
  check; a bare `X-MFA-WebAuthn` header is never trusted.
- **App Check via reCAPTCHA Enterprise.** The client initializes App Check from
  `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`, refreshes tokens in the background, and sends
  `X-Firebase-AppCheck` on every API call. `APP_CHECK_ENFORCEMENT=true` makes API routes reject
  requests without a valid token — the Admin SDK bypasses Firebase's own enforcement, so this is
  the only thing that covers our handlers. Console setup: App Check → Apps → register the web app
  with reCAPTCHA **Enterprise** (site key into the env var — the provider is
  `ReCaptchaEnterpriseProvider`, so a classic v3 key is rejected) → add every deployed domain →
  enforce for Identity Toolkit, Cloud Firestore and Cloud Storage. Locally,
  `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG=true` registers a debug token, which must be added under
  App Check → Debug tokens.
- **Rate limiting requires Redis in production.** If the shared store is not configured, a
  production instance refuses to start rather than falling back to per-instance in-memory limits
  that an attacker could bypass by spreading requests across serverless instances.
- **No CSRF tokens, by design.** Every API route authenticates with a bearer token from the
  `Authorization` header, which a cross-origin request cannot set. The only cookie the app issues is
  the short-lived admin MFA session, and it is `HttpOnly` + `SameSite=Strict` and only ever
  supplements a bearer-verified admin request, so it can neither be read by script nor sent
  cross-site.
- **Environment validation** fails fast in production for missing server secrets; client
  `NEXT_PUBLIC_*` values are validated at runtime so a partial build environment cannot break
  prerendering.
- **CI** runs lint, typecheck, build, tests with coverage and per-file thresholds, the shuffled
  order check, `npm audit`, TruffleHog secret scanning, bundle budgets, the Firestore rules suite,
  Playwright E2E (local money-path contracts plus staging flows) and an axe accessibility job.

## Deployment

Deployed on Vercel. Set every server variable above in the project environment (plus
`UPSTASH_REDIS_REST_URL`/`TOKEN`, and `APP_CHECK_ALERT_WEBHOOK_URL` if the App Check
spike alert should reach a Discord channel). Build with `npm run build`, then start with
`npm start` — it runs the traced standalone server the Docker image also runs, and takes its port from `PORT`.
