# Hooks

Shared client hooks for ShipIN.

## Design notes

- Hooks that subscribe to Firestore realtime data should prefer `useFirestoreSync` so subscription lifecycle, loading state, and error handling are centralized.
- Hook public APIs should remain stable even when the internal subscription strategy changes.
- Avoid duplicate subscription logic across similar hooks (for example support ticket / message hooks).

## Hooks

- `useFirestoreSync` — reusable Firestore `onSnapshot` subscription hook.
- `useSupport` — support tickets + messages for a request (admin-facing variant).
- `useCustomerSupport` — customer support tickets, requests, and messages.
