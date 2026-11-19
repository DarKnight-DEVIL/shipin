# Architecture Audit

Date: 2026-11-09 (Phase 4 — Codebase Cleanup)

This is a point-in-time record, not current guidance — `ARCHITECTURE.md` is the
live description. Paths are relative to `apps/web/`, and the line and test
counts in it have since moved; the corrections below are marked where the
original numbers would mislead.

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

- `AdminCustomer` interface now lives in `src/features/admin/services/customersClient.ts` (the file this pass names, `customers.ts`, no longer exists; the admin components import the client module)
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

### 1. Large page components — mostly resolved

These pages were since split: sections and panels live under
`components/<domain>/` (e.g. `components/admin/wallet/*Panel.tsx`,
`components/settings/*Section.tsx`) with their data hooks in
`features/<domain>/hooks`, so the page is a composition root. Sizes as of
2026-11-18:

- `src/app/(platform)/settings/page.tsx` — 135 lines (was ~1,000)
- `src/app/(platform)/dashboard/page.tsx` — 313 lines (was ~780)
- `src/app/admin/requests/[requestId]/page.tsx` — 164 lines; the route segment
  is `[requestId]`, not `[id]` as written above
- `src/app/admin/wallet/page.tsx` — 90 lines (was ~945)
- `src/app/admin/audit/page.tsx` — 59 lines (was ~851)

Still open:

- `src/app/(platform)/requests/new/page.tsx` — 583 lines, still mixes the
  multi-step form state with presentation.

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

### 4. ESLint debt — resolved

- `npm run lint` is clean; the `no-explicit-any` findings this pass left behind
  have been fixed.

### 5. Documents carry no `schemaVersion`

Tracked, not fixed. No Firestore document is versioned, so a breaking shape
change still needs the manual four-step procedure (additive write, backfill,
dual read, cleanup). `docs/OPERATIONS.md` → *Status: runner exists, documents
are not yet versioned* is the procedure and the current state; the migration
runner below `apps/web/scripts/migrations/` exists, `npm run migrate` wraps it.

## Verification

- TypeScript: `npx tsc --noEmit` passes with no errors.
- Vitest: 10 files, 95 tests passed on the audit date. As of 2026-11-19 the
  suite is 228 files / 2,415 tests across the workspace — 213 files / 2,325
  tests in `apps/web`, plus the four package suites (config 13, shared 12,
  utils 28, ui 37). Recounted with `npm test`; the numbers move, so read them
  from that command rather than from this line.
- No runtime flow was exercised against Firebase or PayPal.
