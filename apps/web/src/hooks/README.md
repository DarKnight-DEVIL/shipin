# Hooks

Shared client hooks for ShipIN.

## Design notes

- Hook public APIs should remain stable even when the internal subscription strategy changes.
- Avoid duplicate subscription logic across similar hooks (for example support ticket / message hooks).

## Hooks

- `useSupport` — support tickets + messages for a request (admin-facing variant).
- `useCustomerSupport` — customer support tickets, requests, and messages.
- `useHydrated` — gating theme-dependent UI without a `setMounted` effect.
- `useUnreadNotifications` — unread notifications count subscription.

## Removed hooks

- `useApiError` — replaced with `withErrorHandler` pattern in API routes and per-page `useState`/`try-catch` for data-fetching hooks.
- `useFirestoreSync` — replaced with direct Firestore subscription patterns in feature pages.
