# ShipIN

ShipIN is a Next.js 16 (App Router) logistics platform for creating international
shipping requests, receiving quotes, paying, tracking warehouse processing, and
managing deliveries.

## Stack

- Next.js 16 / React 19 / TypeScript (strict)
- Tailwind CSS 4
- Firebase (Firestore, Auth) with the Admin SDK on the server
- Cloudflare R2 for file storage
- PayPal for payments
- Resend/SMTP for email, WhatsApp Business API for messaging
- Zod for API input validation

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev                  # http://localhost:3000
```

Other commands:

```bash
npm run build
npm run start
npm run lint
npm test
```

## Project Structure

```text
src/
├── app/                  Next.js routes
│   ├── api/              Route handlers (thin HTTP layer)
│   ├── (platform)/       Customer-facing authenticated pages
│   ├── admin/            Admin dashboard (protected by AdminGuard)
│   ├── login/            Authentication
│   └── track/            Public tracking
├── components/           Shared and feature UI components
├── features/             Domain logic
│   ├── addresses/        Address book
│   ├── finance/          Payment and quote calculations
│   ├── notifications/    Notification reads, writes, delivery
│   ├── requests/         Request workflow and persistence
│   ├── support/          Support tickets
│   ├── users/            Profile and preferences
│   └── wallet/           Wallet reads and admin credits
├── config/               Environment and product configuration
├── hooks/                Reusable React hooks
├── lib/                  Infrastructure only (Firebase, auth, email, R2, security)
├── types/                Canonical domain types
└── utils/                Errors, formatting and shared helpers
```

### Layering

Dependencies point downward only:

```text
app routes/pages  →  features  →  lib  →  config/env
```

- Route handlers parse input, authenticate, delegate, and return JSON.
- Feature services own business rules and persistence.
- `lib/` must not contain feature-specific business logic.
- Components never write to Firestore directly; they call a service or API.
- Canonical domain types live in `src/types/`; feature-only types stay in the
  feature folder.

## Environment Configuration

All environment access goes through `src/config/env`:

```ts
import { serverEnv, clientEnv, isProduction } from '@/config/env';
```

- `serverEnv` — server-only secrets. Required variables fail fast at runtime.
- `clientEnv` — only `NEXT_PUBLIC_*` values.
- Do not read `process.env` directly outside `src/config/env` (the only
  exceptions are framework build/runtime checks such as `NODE_ENV`).

Copy `.env.example` to `.env.local`; `.env.local` is git-ignored.

## API Conventions

Route handlers live in `src/app/api/<resource>/<action>/route.ts` and follow:

```ts
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const body = await parseAndValidate(request);
  const result = await featureService.execute(auth.profile.uid, body);

  return NextResponse.json({ success: true, ...result });
});
```

- Authenticate with `requireAuth` / `requireAuthWithProfile` / `requireAdmin`.
- Validate every body with Zod before using it.
- Derive user identity from the verified token, never from the request body.
- Return `{ success: true, ... }` or let `withErrorHandler` serialize errors.
- Use `Cache-Control: no-store` for private responses.
- Client calls go through `customerApi` or `adminApi` in `src/lib/`.

See [`src/app/api/README.md`](src/app/api/README.md) for details.

## State Management

The app uses two explicit forms of state:

- **Server state:** feature services fetch Firestore data and expose
  `onSnapshot` subscriptions for live collections (requests, notifications,
  support messages).
- **UI state:** page-level React state (`useState` / `useEffect`) for filters,
  form drafts, modals and optimistic updates.

There is intentionally no global client store. If a cross-page client cache is
needed later, add a dedicated data-fetching layer rather than duplicating server
state in Redux slices.

## Testing and Known Debt

Run `npm test` for Vitest unit tests, `npm run lint` for ESLint, and
`npx tsc --noEmit` for type checking. TypeScript passes; the remaining
ESLint debt is tracked in [`docs/ARCHITECTURE_AUDIT.md`](docs/ARCHITECTURE_AUDIT.md).

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full architecture and
[`docs/ARCHITECTURE_AUDIT.md`](docs/ARCHITECTURE_AUDIT.md) for the audit and
remaining cleanup plan.

## Refactoring History

| Date | Change |
|------|--------|
| 2026-11 | **Phase 1–2**: Removed dead `checkout-v2/` route, duplicate `profile/addresses/` page, and orphaned `public/landing.html`. Extracted `PlatformShell` + sub-components (`Brand`, `NavItem`, `Sidebar`, `UserAvatar`) from `(platform)/layout.tsx` into `src/components/platform/`. Created `useUnreadNotifications` hook. Added TODO placeholders for stub admin pages (`purchasing`, `warehouse`). Removed leaked `adminAuthFa` export from `adminApiClient.ts`. |
| 2026-11 | **Phase 3**: Standardized all API error responses to include `success: false` plus a machine-readable `code` field. Fixed middleware rate-limit (429) and CORS (403) responses; updated `requireAuth` / `requireAuthWithProfile` guards in `lib/auth.ts`; fixed `badRequest()` helper in `api/profile/route.ts`. |
| 2026-11 | **Phase 6**: Added Zustand-based shared store at `src/stores/index.ts` exporting `useProfileStore` (`setProfile` / `clearProfile`) for cross-page user-profile caching without redundant Firestore reads. |

