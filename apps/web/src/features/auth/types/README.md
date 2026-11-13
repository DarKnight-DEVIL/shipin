# Auth Feature

Client-side authentication helpers and hooks.

## Hooks

| Name | Purpose |
|------|---------|
| `usePasswordSettings` | Returns password policy rules and current validation result |

## Types

See `types/index.ts` for exported types:
- `UserProfile` — Firebase user profile shape
- `LoginIntent` — pre-authentication session payload
- `LoginIntentResponse` — response from `/api/auth/login-intent`
- `MFAToken` — MFA session token shape

## Usage

```ts
import { usePasswordSettings } from '@/features/auth';

const { rules, currentScore, strengthLabel } = usePasswordSettings(password);
```

