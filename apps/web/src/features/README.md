/**
 * Feature-based module map for ShipIN.
 *
 * Each folder under src/features/ is a self-contained domain slice.
 * Consumers import from the barrel:
 *
 *   import { createRequest, getRequests } from '@/features/requests';
 *   import { getWalletBalance, creditWallet } from '@/features/wallet';
 *
 * Subdirectories inside a feature follow a consistent layout:
 *
 *   src/features/<name>/
 *   ├── index.ts          ← barrel (exports types + services + hooks)
 *   ├── types/            ← domain types, re-export canonical types from @/types
 *   ├── services/         ← Firestore / API service functions
 *   ├── hooks/            ← React hooks built on the services
 *   └── components/       ← feature-scoped UI (rare; most UI lives in src/components)
 */
