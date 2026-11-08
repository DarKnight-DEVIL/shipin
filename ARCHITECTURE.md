# ShipIN Architecture

## Overview

ShipIN is a Next.js 16 (App Router) application for international shipping
logistics. Customers create shipping requests, receive quotes, pay, track
warehouse processing, and manage deliveries. Administrators review requests,
run the warehouse workflow, handle refunds, and manage support.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript 5 (strict)
- **Styling:** Tailwind CSS 4
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth (client) + Firebase Admin Auth (server)
- **Payments:** PayPal (server verification, client SDK)
- **Email:** Resend + SMTP via Nodemailer
- **File storage:** Cloudflare R2
- **Messaging:** WhatsApp Business API
- **Validation:** Zod
- **Rate limiting:** In-memory + optional Upstash Redis

## Project Structure

```text
shipin/
├── public/                    Static assets
├── docs/
│   └── ARCHITECTURE_AUDIT.md  Audit findings and remaining debt
├── src/
│   ├── app/                   Next.js App Router
│   │   ├── (platform)/        Customer routes
│   │   ├── admin/             Admin routes (AdminGuard)
│   │   ├── api/               Route handlers (thin → services)
│   │   ├── login/             Authentication
│   │   └── track/             Public tracking
│   ├── components/            Reusable and feature UI
│   │   ├── ui/                Base primitives (Modal, Badge, Skeleton, etc.)
│   │   ├── platform/          Shared chrome: PlatformShell, Sidebar, Brand, NavItem, UserAvatar
│   │   ├── admin/             Admin UI panels & cards
│   │   ├── checkout/          Checkout flow components
│   │   ├── request/           Request detail components
│   │   ├── support/           Support ticket/conversation UI
│   │   └── landing/           Landing page sections (ProofSection, PricingSection, etc.)
│   ├── features/              Domain modules
│   │   ├── addresses/         Address book (canonical address service)
│   │   ├── admin/             Admin analytics
│   │   ├── auth/              Auth types
│   │   ├── checkout/          Checkout orchestration
│   │   ├── finance/           Payment, fees and quote calculations
│   │   ├── notifications/     Reads, writes, delivery
│   │   ├── payment/           Payment service
│   │   ├── requests/          Request workflow and persistence
│   │   ├── shipments/         Shipment and tracking services
│   │   ├── support/           Support tickets and messages
│   │   ├── users/             Profile and preferences
│   │   └── wallet/            Wallet reads and admin credits
│   ├── hooks/                 Reusable React hooks
│   ├── lib/                   Shared infrastructure only
│   │   ├── auth.ts            Customer auth guards
│   │   ├── adminAuth.ts       Admin auth + MFA gate
│   │   ├── firebase*.ts       Firebase client/Admin setup
│   │   ├── paypal.ts          PayPal client
│   │   ├── mailer.ts          Email transport
│   │   ├── r2.ts              Object storage
│   │   ├── security*.ts       CORS, CSRF, headers
│   │   ├── rateLimiter.ts     Rate limiting
│   │   ├── validation.ts      Shared Zod schemas
│   │   ├── customerApiClient.ts
│   │   ├── adminApiClient.ts
│   │   └── pdf/               PDF generation
│   ├── config/                Environment and product configuration
│   ├── stores/                Zustand shared client store (useProfileStore)
│   ├── types/                 Canonical domain types
│   ├── utils/                 Errors and formatting
│   └── middleware.ts          Rate limit, CORS, CSP
└── ...
```

## Layering Rules

Dependencies point downward only:

```text
app routes/pages  →  features  →  lib  →  config/env
```

1. **Route handlers stay thin.** Parse/validate input, run an auth guard,
   delegate to a feature service, return JSON.
2. **Features are self-contained.** A feature owns its services, types, hooks,
   and components. Other features use its exported service API.
3. **`lib/` is infrastructure.** No feature-specific business rules. If logic
   only makes sense for requests, addresses, notifications, etc., it belongs in
   that feature.
4. **Components never write to Firestore directly.** They call a service or an
   API route. Read-only live subscriptions are exposed by feature services.
5. **Types.** Canonical domain types live in `src/types/`; feature-specific
   request/response types live in `src/features/*/types`.

## Environment Configuration

All environment access goes through `src/config/env`:

```ts
import { serverEnv, clientEnv, isProduction } from '@/config/env';
```

- `serverEnv` — server-only secrets. Required variables fail fast at runtime;
  the build phase tolerates missing variables so page-data collection can run.
- `clientEnv` — only `NEXT_PUBLIC_*` variables, safe to bundle.
- Never read `process.env` directly outside this module, except for framework
  `NODE_ENV` checks.
- Copy `.env.example` to `.env.local`; `.env.local` is git-ignored.

## Error Handling

All application errors extend `ShipINError` in `@/utils/errors`:

| Error class | Code | HTTP |
| --- | --- | --- |
| `ValidationError` | `VALIDATION_ERROR` | 400 |
| `AuthenticationError` | `AUTHENTICATION_ERROR` | 401 |
| `AuthorizationError` | `AUTHORIZATION_ERROR` | 403 |
| `NotFoundError` | `NOT_FOUND` | 404 |
| `PaymentError` | `PAYMENT_ERROR` | 402 |
| `RateLimitError` | `RATE_LIMIT_ERROR` | 429 |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` | 502 |

Conventions:

1. Services wrap operations in `try/catch` and rethrow via `toShipINError`.
2. Route handlers are wrapped with `withErrorHandler`, which serializes
   `{ error, code, details? }` and only includes `details` outside production.
3. Client calls go through `customerApi` or `adminApi`; both attach the
   Firebase ID token and convert non-OK responses into typed errors.
4. Log server-side with a `[Context]` prefix and return a generic client message.

## API Structure

Routes live under `src/app/api/` and mirror the resource model:

```text
api/
├── auth/            login-intent, mfa/{totp,webauthn,sms}, password-leak-check
├── requests/        [requestId]/{quote,refund,partial-refund,shipment-status,
│                    additional-items,approve-quote,status,notifications}
├── admin/           requests/[requestId]/{refund,refund-offer,partial-refund,
│                    warehouse,shipment,additional-items,approve-international},
│                    shipments/[shipmentId], wallet/credit
├── addresses/       create, update/delete, set default
├── notifications/   create, mark read/delete, read-all, clear-read, preferences
├── profile/         create/update, dashboard preferences
├── paypal/          create-order, capture-order, wallet top-ups
├── payment/         complete-wallet
├── support/         [ticketId]/message
├── r2/              upload, view
├── tracking/        [trackingId]
├── send-email/      transactional email dispatch
└── webhook/         provider callbacks
```

See [`src/app/api/README.md`](src/app/api/README.md) for the handler contract.

## State Management

There is no global client store. State is split deliberately:

- **Server state:** feature services fetch Firestore data and expose
  `onSnapshot` subscriptions for live data (requests, notifications, support).
- **UI state:** page-level `useState` for filters, drafts, modals, and
  optimistic updates.
- **Cross-page cache:** `src/stores/index.ts` provides a lightweight Zustand
  store (currently only `useProfileStore` for short-lived profile cache). If
  more cross-page caching is needed, extend this file rather than adding new
  store files.

This keeps a single source of truth in Firestore and avoids duplicating server
data in a client cache. If cross-page client caching becomes necessary, add a
dedicated data-fetching layer rather than Redux slices that shadow Firestore.

## Naming Conventions

- Files: `camelCase.ts`; React components `PascalCase.tsx`.
- Features: one folder per domain with `services/`, `types/`, `hooks/`,
  `components/` subfolders as needed.
- Services export named functions; one responsibility per module.
- API routes: kebab-case folders, `route.ts` entry file.
- Env vars: `UPPER_SNAKE_CASE`; client-exposed vars prefixed `NEXT_PUBLIC_`.

## Testing

- Vitest for unit tests (`npm test`).
- ESLint for linting (`npm run lint`).
- Type checking with `npx tsc --noEmit` (see known debt in
  `docs/ARCHITECTURE_AUDIT.md`).
