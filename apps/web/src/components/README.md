# ShipIN — Component Library

> Every component follows PascalCase. Files are colocated next to their tests (`.test.tsx`).

## Directory Map

| Folder | Purpose |
|--------|---------|
| `ui/` | Primitives: Button, Modal, Badge, Skeleton, Stepper, etc. |
| `platform/` | Customer-shell chrome: sidebar, nav, brand, user avatar |
| `admin/` | Admin-only panels: dashboard KPIs, request detail panes, security settings |
| `request/` | Per-request customer UI: quote card, timeline, tracking, additional items |
| `checkout/` | Checkout flow: cost breakdown, payment card, security notice, timeline |
| `dashboard/` | Dashboard widgets: metric cards, attention rows, shipment/ request cards |
| `settings/` | Settings pages: account, appearance, notifications, security sections |
| `support/` | Support center: ticket list, conversation, reply box, new-ticket modal |
| `address/` | Address book: picker, form, country select, phone input |
| `invoice/` | Invoice preview & summary |
| `payment/` | PayPal checkout wrapper |
| `landing/` | Public landing sections: proof, pricing, network, spline hero |
| `globe-dashboard/` | 3D globe visualization for the analytics dashboard |

## Naming Conventions

- **Component file:** `PascalCase.tsx` (e.g. `RequestCard.tsx`)
- **Test file:** `ComponentName.test.tsx` beside the source
- **Non-component helper:** `camelCase.ts` (e.g. `helpers.ts`, `useCountUp.ts`)
- **Styles files:** `componentNameStyles.ts` (see `SettingsButtons.tsx` / `settingsStyles.ts` pattern)

## Error Handling in Components

All async data fetching is wrapped with `useApiError` hook or equivalent. Errors surface as toasts via `sonner`.

## Re-exporting

Feature-specific components can also be re-exported through their feature barrel (`@/features/*/index`) when appropriate. The component barrel above covers shared primitives only.
