# ShipIN Architecture Documentation

## Overview

ShipIN is a Next.js 16 (App Router) application for international shipping logistics. It provides a platform for customers to create shipping requests, track shipments, manage payments, and interact with support.

## Tech Stack

- **Framework**: Next.js 16.4 (App Router, Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **Database**: Firebase Firestore (via Firebase Admin SDK server-side, Firebase Client SDK client-side)
- **Authentication**: Firebase Auth (client) + Firebase Admin Auth (server)
- **Payments**: PayPal SDK (server-side), @paypal/react-paypal-js (client)
- **Email**: Resend (primary) + SMTP via Nodemailer (fallback)
- **File Storage**: Cloudflare R2 (S3-compatible)
- **Messaging**: WhatsApp Business API
- **State Management**: Redux Toolkit
- **Validation**: Zod
- **Rate Limiting**: In-memory + Upstash Redis (optional)

## Project Structure

```
shipin/
├── public/                 # Static assets
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (platform)/     # Customer-facing routes (authenticated)
│   │   ├── admin/          # Admin panel routes
│   │   ├── api/            # API routes (thin handlers → services)
│   │   ├── login/          # Auth pages
│   │   └── ...
│   ├── components/         # Reusable UI components
│   │   ├── ui/             # Base UI primitives (shadcn-style)
│   │   ├── forms/          # Form components
│   │   ├── layout/         # Layout components
│   │   └── common/         # Business-agnostic components
│   ├── features/           # Feature-based modules (business logic)
│   │   ├── auth/           # Authentication
│   │   ├── requests/       # Shipping requests
│   │   ├── payments/       # Payment processing (PayPal, wallet)
│   │   ├── wallet/         # Wallet management
│   │   ├── notifications/  # Notification system
│   │   ├── support/        # Support tickets
│   │   ├── checkout/       # Checkout flow
│   │   ├── admin/          # Admin dashboard
│   │   └── tracking/       # Package tracking
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Core libraries (shared infrastructure)
│   │   ├── config/         # Configuration
│   │   │   └── env/        # Environment variables (validated)
│   │   ├── firebase/       # Firebase client + Admin SDK
│   │   ├── utils/          # General utilities
│   │   │   ├── errors/     # Error classes + factory + handlers
│   │   │   ├── format/     # Formatting helpers
│   │   │   └── validation/ # Zod schemas
│   │   ├── security/       # Security utilities
│   │   │   ├── cors.ts
│   │   │   ├── csrf.ts
│   │   │   ├── headers.ts  # Security headers + CSP
│   │   │   └── mfa.ts      # Multi-factor auth helpers
│   │   └── types/          # Shared TypeScript types
│   ├── middleware.ts       # Next.js middleware (rate limit, CORS, CSP)
│   ├── services/           # API service layer
│   │   └── api/
│   │       └── client.ts   # HTTP client
│   ├── store/              # Redux store
│   │   ├── slices/         # Feature slices
│   │   └── index.ts
│   ├── types/              # Global domain types
│   └── utils/              # Canonical shared utilities
│       ├── errors/         # ShipINError classes + toShipINError + serializeError + withErrorHandler
│       └── format/         # Currency, date, phone, tracking-id formatters
├── .env.example            # Environment template
├── next.config.ts
├── package.json
├── tsconfig.json
└── firestore.rules
```

> Note: `src/lib/errors` and `src/lib/utils` are backward-compatibility
> re-export barrels. New code should import from `@/utils/errors` and
> `@/utils/format` directly.

## Layering Rules

The codebase follows a strict dependency direction (top may import from
bottom, never the reverse):

```
pages/routes (src/app)        ← thin: server components + route handlers
     │
features (src/features/*)     ← business logic: services, hooks, types, store, components
     │
lib (src/lib/*)               ← infrastructure: firebase, auth guards, integrations
     │
config/env (src/config/env)   ← single source of truth for process.env
```

Rules:

1. **Route handlers stay thin.** Each `route.ts` should only parse/validate
   input, call an auth guard, delegate to a service, and return JSON.
   Business logic lives in `src/features/*/services` or `src/lib/*`.
2. **Features are self-contained.** A feature owns its services, types,
   hooks, and components. Features may import from `lib` and `config`,
   but other features must not reach into another feature's internals —
   use its exported service API instead.
3. **`lib/` holds shared infrastructure**, not feature-specific logic.
   Feature-specific persistence belongs in `features/*/services`.
4. **UI components live in `components/` (shared) or `features/*/` (feature).**
   Components never write to Firestore directly — they call services.
5. **Types:** canonical domain types live in `src/types/`; feature
   request/response types live in `src/features/*/types` and re-export
   the canonical types.

## Environment Configuration

All environment access goes through `src/config/env`:

```ts
import { serverEnv, clientEnv, isProduction } from '@/config/env';
```

- `serverEnv` — server-only secrets (Firebase Admin, PayPal, SMTP, R2,
  Upstash). Throws at startup if a required var is missing (fail fast).
- `clientEnv` — only `NEXT_PUBLIC_*` vars. Safe to bundle into the browser.
- Never read `process.env` directly outside this module.
- Copy `.env.example` to `.env.local` and fill in real values.
  `.env.local` is git-ignored; `.env.example` documents required keys.

## Error Handling

All application errors extend `ShipINError` (in `@/utils/errors`) and carry
a machine-readable `code` and HTTP `status`:

| Error class            | Code                     | HTTP |
| ---------------------- | ------------------------ | ---- |
| `ValidationError`      | `VALIDATION_ERROR`       | 400  |
| `AuthenticationError`  | `AUTHENTICATION_ERROR`   | 401  |
| `AuthorizationError`   | `AUTHORIZATION_ERROR`    | 403  |
| `NotFoundError`        | `NOT_FOUND`              | 404  |
| `PaymentError`         | `PAYMENT_ERROR`          | 402  |
| `RateLimitError`       | `RATE_LIMIT_ERROR`       | 429  |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` | 502  |

Conventions:

1. **Services** wrap operations in try/catch and rethrow via
   `toShipINError(error)` — this maps Firebase/Firestore error strings
   (`permission-denied`, `not-found`, ...) to the right error class.
2. **Route handlers** should be wrapped with `withErrorHandler(...)` so any
   thrown error is serialized by `serializeError` into
   `{ error, code, details? }`. `details` is only included outside
   production, so stack internals never leak to clients.
3. **Client API calls** go through `apiClient` (`@/services/api/client`),
   which converts non-OK responses into `ShipINError`s and logs every
   failure with URL/status/code context.
4. Log server-side with a `[Context]` prefix (e.g. `[Auth]`,
   `[API Client]`) before converting to an error response.

## API Structure

API routes live under `src/app/api/` and mirror the resource model:

```
api/
├── auth/            # login-intent, mfa/{totp,webauthn,sms}, password-leak-check
├── requests/        # [requestId]/{quote,refund,partial-refund,shipment-status,request-new-quote}
├── admin/           # requests/[requestId]/{refund,refund-offer,partial-refund}, wallet/credit
├── paypal/          # create-order, capture-order, complete-payment, create/capture-wallet-topup
├── payment/         # complete-wallet
├── r2/              # upload, view (presigned R2 access)
└── send-*-email/    # notification email dispatch
```

Handler pattern:

```ts
import { withErrorHandler } from '@/utils/errors';
import { requireAuth } from '@/lib/auth';
import { myService } from '@/features/my-feature/services';

export const POST = withErrorHandler(async (request: Request) => {
  const auth = await requireAuth(request);          // 1. auth guard
  if (auth instanceof NextResponse) return auth;

  const body = await parseBody(request);            // 2. parse + validate
  const result = await myService.doThing(body);     // 3. delegate to service
  return NextResponse.json(result);                 // 4. respond
});
```

Adding a new endpoint:

1. Create the route file under `api/<resource>/<action>/route.ts`.
2. Put the logic in the owning feature's service, not the route.
3. Wrap with `withErrorHandler`; use `requireAuth` / `requireAdmin` guards.
4. Return `NextResponse.json` with stable, documented shapes.

## State Management

Client state uses Redux Toolkit (`src/store`) with per-feature slices:
`auth`, `requests`, `notifications`, `support`, `wallet`.

- Slices hold only UI-relevant server data (loaded entities, flags, errors).
- All async data fetching flows through feature services; slices store results.
- Real-time data (request status, support messages, notifications) arrives
  via Firestore `onSnapshot` subscriptions exposed by feature services.

## Naming Conventions

- Files: `camelCase.ts`; `PascalCase.tsx` for React components.
- Features: folder per domain (`features/requests/`) with `services/`,
  `types/`, `hooks/`, `components/` subfolders as needed.
- Services export named functions (or a single `XService` class instance);
  one responsibility per module.
- API routes: kebab-case folders, `route.ts` entry file.
- Env vars: `UPPER_SNAKE_CASE`; client-exposed vars prefixed `NEXT_PUBLIC_`.