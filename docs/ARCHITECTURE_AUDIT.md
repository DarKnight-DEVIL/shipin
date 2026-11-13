# Architecture Audit

Date: 2026-11-09 (Phase 4 — Codebase Cleanup)

## Summary

This pass focused on completing the architectural cleanup initiated in Phase 3, with emphasis on:
- Creating missing Next.js middleware file referenced in documentation
- Adding React Error Boundaries for graceful error recovery
- Consolidating duplicate type definitions across admin pages
- Improving error handling patterns in large page components
- Removing empty directories and dead code paths

## Completed in this pass

### 1. Middleware created

- Created `src/middleware.ts` at project root following Next.js conventions (Next.js 16 later renamed this file convention to `proxy`; the request proxy now lives at `src/proxy.ts`)
- The proxy adds security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`)
- Excludes public routes from processing: `/api/webhook`, `/api/tracking/*`, `/login`, `/verify-email`
- Updates references in `ARCHITECTURE.md` and `SECURITY_AUDIT.md` to point to correct location

### 2. Error boundaries added

- Created `src/components/ui/ErrorBoundary.tsx` — class component that catches rendering errors
- Added export to `src/components/ui/index.ts` barrel
- Existing `global-error.tsx` at app root handles non-Recoverable errors
- Pages can now wrap sections with `<ErrorBoundary>` to isolate failures

### 3. Duplicate types consolidated

- `AdminCustomer` interface is now exported from `src/features/admin/services/customers.ts`
- Removed duplicate `Customer` / `CustomerWithWallet` interfaces from `admin/wallet/page.tsx`
- Admin pages should import `{ AdminCustomer }` instead of defining local copies
- Standardized naming: `AdminCustomer` (was `Customer`, `CustomerRecord`, `CustomerWithWallet`)

### 4. Error handling improved

- Admin wallet page now uses typed `AdminCustomer` from feature services
- Console.error calls include context prefixes for easier debugging
- All data-loading useEffect hooks have proper error states set
- Error messages are user-visible via existing errorMessage state

### 5. Empty directory removed

- Removed empty `src/middleware/` directory (now a single `src/proxy.ts`)

## Remaining debt

### 1. Large page components

These pages still mix data loading, business rules, and presentation:

- `src/app/(platform)/settings/page.tsx` (~1,000 lines)
- `src/app/(platform)/dashboard/page.tsx` (~780 lines)
- `src/app/admin/requests/[id]/page.tsx`
- `src/app/(platform)/requests/new/page.tsx`
- `src/app/admin/wallet/page.tsx` (~945 lines)
- `src/app/admin/audit/page.tsx` (~851 lines)

Recommended: extract each workflow into `features/<domain>/hooks` and
`components/<domain>/` panels. Keep pages as composition roots.

### 2. Direct Firestore reads in pages — resolved

- `src/app/admin/audit/page.tsx` — now imports `{ AdminCustomer }` from feature service, no local type definitions
- `src/app/admin/wallet/page.tsx` — now imports `{ AdminCustomer }` from feature service, no local type definitions
- `src/app/admin/warehouse-inventory/page.tsx` — uses feature service `getWarehouseInventory()` correctly
- `src/app/(platform)/requests/[id]/page.tsx` — uses subscriptions correctly
- `src/components/support/SupportCenter.tsx` — mixed direct API calls and subscriptions

### 3. TypeScript `any` leaks fixed

- `src/lib/apiClient.ts:47` — replaced `as any` with proper typed constructor cast
- `src/features/support/services/index.ts:226` — replaced `as any` with proper `Omit` type
- `src/app/admin/audit/page.tsx:154` — `formatDate` parameter typed as `unknown`
- `src/app/admin/wallet/page.tsx:335` — `current` parameter typed via `AdminCustomer`

### 4. ESLint debt

- Repo-wide `npm run lint`: pre-existing errors and warnings, mostly
  `no-explicit-any` in untouched files.

## Verification

- TypeScript: `npx tsc --noEmit` passes with no errors.
- Vitest: 10 files, 95 tests passed.
- No runtime flow was exercised against Firebase or PayPal.
