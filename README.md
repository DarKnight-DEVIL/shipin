# ShipIN

International shipping platform for creating shipping requests, receiving quotes, paying (PayPal or
wallet), and managing warehouse receiving, inspection, storage and delivery — all behind a
Firebase-authenticated customer portal and an MFA-protected admin console.

> Canonical deployment: <https://shipin-psi.vercel.app>

## Stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 16.4 (App Router, Turbopack), React 19.2 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4, lucide-react, framer-motion |
| Auth | Firebase Auth (client) + Firebase Admin SDK (server) |
| Data | Firestore (client and admin access) |
| Payments | PayPal REST (orders + capture + webhooks), internal wallet |
| Rate limiting | Upstash Redis (`@upstash/ratelimit`) |
| Storage | Amazon S3 / Cloudflare R2 (presigned uploads) |
| Email | Resend with SMTP fallback |
| Messaging | WhatsApp Cloud API |
| Observability | Sentry, Vercel Analytics / Speed Insights |
| Tests | Vitest 5 + Testing Library, Playwright (E2E) |

## Project layout

```
src/
  app/            App Router pages, layouts and API route handlers
  components/      Shared UI (marketing, dashboard, admin, invoice, support)
  features/        Domain services: requests, quotes, payments, shipments,
                   warehouse, notifications, finance, admin
  hooks/           Client hooks (auth, support, axe accessibility scans)
  lib/             Server/client primitives: auth, adminAuth, firebaseAdmin,
                   paypal, wallet, mfa, webauthn, rate limiting, csrf, mailer
  config/env/      Validated server and client environment access
  proxy.ts         Request proxy (security headers, rate limiting, CORS)
  stores/          Zustand stores
  types/           Shared domain types
packages/
  config, shared, ui, utils   Workspace packages
```

## Prerequisites

- Node.js 20 or newer (CI runs on 20; development on 22+ is supported)
- A Firebase project with Auth and Firestore enabled
- PayPal REST credentials (sandbox or live)
- Upstash Redis database — **required in production** (see Security)

## Getting started

```bash
npm ci
cp .env.example .env.local   # if present, then fill in the values below
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
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Shared rate-limit store |
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
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Unit/route tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with per-file coverage thresholds |
| `npm run test:security` | Focused suite: auth, MFA session, Firestore rules |

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
- **Rate limiting requires Redis in production.** If the shared store is not configured, a
  production instance refuses to start rather than falling back to per-instance in-memory limits
  that an attacker could bypass by spreading requests across serverless instances.
- **CSRF** applies to cookie-authenticated state-changing requests. Bearer-token requests are
  exempt by design, since browsers do not attach them automatically.
- **Environment validation** fails fast in production for missing server secrets; client
  `NEXT_PUBLIC_*` values are validated at runtime so a partial build environment cannot break
  prerendering.
- **CI** runs lint, typecheck, build, tests with coverage, `npm audit`, TruffleHog secret scanning,
  Playwright smoke tests and an axe accessibility job.

## Deployment

Deployed on Vercel. Set every server variable above in the project environment (plus
`UPSTASH_REDIS_REST_URL`/`TOKEN` and `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` if Sentry
source maps should be uploaded during the build). Build with `npm run build`, then start with
`npm start`.
