# Architecture Audit

Date: 2026-11-07

## Summary

The project has a sound target architecture — App Router pages, feature
services, shared infrastructure in `lib`, and authenticated API routes — but it
had accumulated parallel implementations and unused scaffolding. This pass
removed the dead paths and consolidated the duplicates that were safe to move
without rewriting working pages.

## Completed in this pass

### Dead code removed

- Root diagnostic scripts containing hardcoded test credentials:
  `diagnose.js`, `diagnose2.js`, `get-token.js`, `get-token-fetch.js`,
  `test-api.js`. These were tracked, unreferenced, and should have been rotated
  or discarded long ago.
- Unused Redux store and slices (`src/store/`) — nothing imported the store and
  `@reduxjs/toolkit` was not declared in `package.json`.
- Unused generic API client (`src/services/api/client.ts`) — every live call
  uses `customerApi` or `adminApi`.
- Empty notification component and empty legacy placeholder directory.
- Unused `src/lib/firestore.ts` and `src/lib/firestoreServer.ts` compatibility
  barrels after moving their two consumers to feature services.
- Duplicate finance calculator files. The canonical implementations now live in
  `src/features/finance/services/`.
- Duplicate address implementations. The canonical service is now
  `src/features/addresses/services/addresses.ts`.
- Duplicate request status/label barrels in `lib/`; consumers import from
  `src/features/requests/services/`.

### Layering fixes

- Moved notification delivery logic from
  `src/lib/notifications/notificationService.ts` to
  `src/features/notifications/services/notificationService.ts`.
- Moved storage-policy logic from `src/lib/warehouse.ts` to
  `src/features/requests/services/warehousePolicy.ts`.
- `src/lib/` now contains infrastructure only: Firebase, auth, HTTP clients,
  email, payments, storage, security, validation, PDF and formatting.

### Configuration

- Replaced direct `process.env.PAYPAL_API_URL` reads in PayPal routes with
  `serverEnv.PAYPAL_API_URL`.
- Replaced `process.env.NEXT_PUBLIC_APP_URL` in login and email-verification UI
  with `clientEnv.NEXT_PUBLIC_APP_URL`.
- Remaining direct `process.env` reads are framework `NODE_ENV` checks (error
  boundaries, middleware, error serializer), which are intentional.

### Error handling

- Wrapped the anonymous `login-intent` route with `withErrorHandler`; a Redis
  or rate-limiter failure now returns a serialized error instead of an
  unhandled route exception.
- All API routes now either use `withErrorHandler` or have an explicit
  `try/catch` that returns a JSON error.

### Documentation

- Rewrote `README.md` with actual project setup, structure, layering, env and
  state conventions.
- Rewrote `ARCHITECTURE.md` to match the current codebase.
- Added `src/app/api/README.md` documenting the API contract.

## Remaining debt and recommended next steps

### 1. Large page components

These pages mix data loading, business rules, and presentation:

- `src/app/(platform)/settings/page.tsx` (~1,000 lines)
- `src/app/(platform)/dashboard/page.tsx` (~780 lines)
- `src/app/admin/requests/[id]/page.tsx`
- `src/app/(platform)/requests/new/page.tsx`

Recommended: extract each workflow into `features/<domain>/hooks` and
`components/<domain>/` panels. Keep pages as composition roots.

### 2. Direct Firestore reads in pages

Some customer/admin pages still call `getDocs`/`onSnapshot` directly instead of
going through a feature service:

- `src/app/admin/audit/page.tsx`
- `src/app/admin/dashboard/page.tsx`
- `src/app/admin/requests/page.tsx`
- `src/app/admin/wallet/page.tsx`
- `src/app/admin/warehouse-inventory/page.tsx`
- `src/app/(platform)/requests/[id]/page.tsx`
- `src/components/support/SupportCenter.tsx`

Writes are already behind services/API routes. These reads should move to
feature services for consistency and easier testing.

### 3. Type checking

`npx tsc --noEmit` passes with no errors. The Vitest setup now imports
`@testing-library/jest-dom/vitest` so DOM matchers are typed, `InspectionPhotos`
imports `adminApi` and `auth` from the correct modules, and the landing section
prop shapes live in `src/components/landing/types.ts` instead of importing the
page route.

### 4. API response consistency

Most routes return `{ success: true, ... }`, but auth guards return
`{ error }` only and some legacy admin routes return raw provider messages.
Standardize on the `serializeError` shape everywhere.

### 5. Component/naming consistency

- `src/components/globe-dashboard/GlobeDashboard.jsx` is the only JavaScript
  React component; convert to `.tsx` when it is next touched.
- Feature folders are broadly consistent, but `features/auth` currently holds
  types only while auth UI lives in `app/login` and `components/auth`.
- Keep kebab-case route folders and camelCase service files; do not add new
  top-level compatibility barrels.

### 6. State management

The unused Redux store was removed. The documented approach is Firestore
subscriptions for server state plus page-level React state for UI. If
cross-page caching is needed, prefer a dedicated query layer (for example a
typed cache hook) over global slices that duplicate Firestore.

### 7. Credentials

The removed root scripts contained hardcoded credentials in git history.
Remove them from history or rotate the credentials. Do not add new diagnostic
scripts to the repository; keep them in a scratch directory and load secrets
from the environment.

## Verification

- ESLint on the changed modules: 0 errors (3 unused-parameter warnings in the
  storage policy stub).
- Repo-wide `npm run lint`: 138 errors and 69 warnings, all pre-existing and
  mostly `no-explicit-any` in untouched files. Lint no longer scans agent
  tooling folders.
- TypeScript: `npx tsc --noEmit` passes with no errors.
- Vitest: 10 files, 95 tests passed.
- No runtime flow was exercised against Firebase or PayPal.
