# ShipIN Architecture & Documentation

## Project Overview

ShipIN is an international shopping forwarding platform built on **Next.js 16 (App Router)** with **React 19**, **TypeScript**, and **Firebase**. It handles requests, quotes, payments, shipments, warehousing, and admin operations.

---

## Folder Structure

```
src/
├── app/                    # Next.js App Router pages + API routes
│   ├── (platform)/         # Customer-facing layout group
│   ├── admin/              # Admin portal pages
│   ├── api/                # REST API routes (all wrapped in withErrorHandler)
│   ├── login/              # Auth page
│   └── track/              # Public tracking page
├── components/             # Reusable UI components
│   ├── ui/                 # Shared primitive components
│   ├── address/            # Address-related components
│   ├── checkout/           # Checkout flow components
│   └── ...
├── config/                 # Static configuration (payments, pricing, env)
│   ├── env/index.ts        # Centralized environment variable access
│   ├── payments.ts
│   ├── pricing.ts
│   └── shippingDestinations.ts
├── features/               # Feature-based business logic modules
│   ├── addresses/          # Address domain (services, types)
│   ├── admin/              # Admin domain (hooks, services)
│   ├── auth/               # Auth domain (hooks, types)
│   ├── checkout/           # Checkout domain (services, types)
│   ├── finance/            # Financial operations (fee calc, refunds)
│   ├── notifications/      # Notification services & hooks
│   ├── payment/            # Payment processing
│   ├── requests/           # Request lifecycle management
│   ├── shipments/          # Shipping & tracking
│   ├── support/            # Support ticket handling
│   ├── users/              # User profile & preferences
│   └── wallet/             # Wallet & balance management
├── hooks/                  # Shared client-side hooks
├── lib/                    # Core utilities (auth, API clients, Firebase)
├── styles/                 # Consolidated CSS modules
├── stores/                 # Zustand stores
├── types/                  # Canonical TypeScript interfaces
└── utils/                  # Pure utility functions (errors, formatters)


---

## Key Design Decisions

### 1. Error Handling — `withErrorHandler` Pattern

All API routes wrap their handlers in `withErrorHandler` from `@/utils/errors`. This:
- Catches all errors uniformly
- Converts them to `ShipINError` instances via `toShipINError()`
- Serializes a consistent JSON shape `{ error, code }` without leaking internal details
- Logs the error with its code for server-side debugging

**Use it everywhere:**
```typescript
export const POST = withErrorHandler(async (request, context) => {
  // Your handler logic here
  throw new ValidationError("Missing required field");
  throw new NotFoundError("Request");
  throw new AuthenticationError();
});
```

### 2. Feature-Based Architecture (`src/features/`)

Each feature folder is a self-contained domain slice:
- `index.ts` — barrel export
- `types/` — domain-specific interfaces
- `services/` — pure business logic / data-fetching functions
- `hooks/` — React hooks wrapping services

Import from the barrel:
```typescript
import { createRequest, getRequests } from "@/features/requests";
import { getWalletBalance, creditWallet } from "@/features/wallet";
```

### 3. API Clients (`src/lib/`)

| Client | Purpose |
|--------|---------|
| `apiFetch()` | Base factory for authenticated fetch calls |
| `customerApi()` | Customer-facing route authentication |
| `adminApi()` | Admin routes with elevated MFA session check |

### 4. Environment Variables (`src/config/env/index.ts`)

Centralized, validated env access:
- **Server-only vars**: Firebase Admin keys, PayPal secrets, R2 credentials
- **Client vars**: Prefixed `NEXT_PUBLIC_`, safe for browser bundle
- **Optional vars**: Have defaults or no validation

```typescript
import { serverEnv, clientEnv } from "@/config/env";
const paypalSecret = serverEnv.PAYPAL_CLIENT_SECRET;
```

### 5. State Management (Zustand)

Stores in `src/stores/index.ts`:
- `useProfileStore` — user profile cache across navigation
- `useUiStore` — modals, active tabs, global loading overlay
- `useNotificationsStore` — unread count
- `useRequestsStore` — selected request, filter state
- `useWalletStore` — cached wallet balance

---

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Pages/directories | kebab-case | `wallet/topup/` |
| Components | PascalCase files | `InspectionPhotoGallery.tsx` |
| Services | camelCase | `quoteCalculator.ts` |
| Hooks | `use*` prefix | `useNotificationSettles.ts` |
| Types | PascalCase, singular | `UserProfile`, `RequestListResponse` |
| Constants | UPPER_SNAKE_CASE | `PRICING.FREE_SERVICE_LIMIT` |
| API route exports | named exports | `export const GET = ...` |

---

## Adding a New Feature

1. Create `src/features/<name>/index.ts` (barrel)
2. Create `src/features/<name>/types/index.ts` (domain types)
3. Create `src/features/<name>/services/*.ts` (business logic)
4. Create `src/features/<name>/hooks/*.ts` if you need React hooks
5. Export everything from `index.ts`
6. Wire up API routes under `src/app/api/<name>/` using `withErrorHandler`

---

## Testing & Linting

```bash
npm test          # Run all Vitest tests
npm run lint      # ESLint checks
```

Tests co-locate with source (`*.test.ts`, `*.test.tsx`). All 95 tests pass.

---

## Deployment

Build target: `standalone` (Vercel optimal). Required build-time env vars are validated by `src/config/env/index.ts` — missing required vars fail the build immediately.

```
