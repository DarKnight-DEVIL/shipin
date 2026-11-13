## Production Deployment Checklist

> **Operations:** schema migrations, backups/disaster recovery, rollback and
> monitoring are documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

### Required Vercel Environment Variables

Set these in your Vercel project settings → Environment Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Yes | Production URL (e.g., `https://shipin-psi.vercel.app`) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase client config |
| `FIREBASE_ADMIN_PROJECT_ID` | Yes | Server-only (not exposed to client) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Yes | Server-only (not exposed to client) |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Yes | Server-only (not exposed to client) — keep `\n` as literal newlines |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Yes | PayPal client SDK |
| `PAYPAL_CLIENT_ID` | Yes | Server-side PayPal API |
| `PAYPAL_CLIENT_SECRET` | Yes | Server-side PayPal API |
| `PAYPAL_ENV` | Yes | `live` or `sandbox` |
| `PAYPAL_WEBHOOK_ID` | Yes | PayPal webhook verification |
| `RESEND_API_KEY` | Yes | Transactional emails |
| `SMTP_EMAIL` / `SMTP_PASSWORD` | Fallback | SMTP fallback |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | Yes | Cloudflare R2 uploads |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Optional | WhatsApp Business API |
| `MFA_SESSION_SECRET` | Optional | Admin MFA session signing (min 32 chars) |
| `UPSTASH_REDIS_REST_URL` | **Critical** | **Upstash Redis for global rate limiting** |
| `UPSTASH_REDIS_REST_TOKEN` | **Critical** | **Upstash Redis for global rate limiting** |

### Domains and origins

This app is reachable from more than one hostname, and origin handling is
explicit rather than wildcarded:

| Host | Role |
|------|------|
| `https://shipin-psi.vercel.app` | **Canonical** — use for `NEXT_PUBLIC_APP_URL`, `APP_URL`, links and passkeys |
| `https://shipin-9576a.web.app` | Firebase Hosting alias (secondary, API access only) |
| `https://shipin-9576a.firebaseapp.com` | Firebase Hosting alias (secondary, API access only) |
| `http://localhost:3000`, `http://127.0.0.1:3000` | Local development |

- All of the hosts above are accepted by `src/lib/cors.ts`. Add or change hosts
  with `APP_ALLOWED_ORIGINS` (comma-separated) instead of editing code; the
  variable is optional and unset by default.
- Set both `NEXT_PUBLIC_APP_URL` and `APP_URL` to the canonical domain users
  actually visit. They build verification links and the WebAuthn relying party,
  so a mismatch sends users to the wrong site and breaks passkeys.
- WebAuthn cannot span domains. `vercel.app`, `web.app` and `firebaseapp.com`
  are separate registrable domains, so a passkey registered on one is invalid
  on another. **Vercel is the canonical host**, so the relying party is
  `shipin-psi.vercel.app`; passkeys registered on the Firebase aliases will not
  validate. If a custom domain is added later, migrate MFA to it deliberately
  (existing passkeys have to be re-registered).
- `firebase.json` currently configures only Firestore and Storage rules. There
  is no `hosting` block, so the Firebase Hosting URLs do not serve this Next.js
  app yet; they need a Hosting target (static export or a Cloud Run / Functions
  backend).

### Enabling Global Rate Limiting (Upstash Redis)

1. **Create an Upstash Redis database**:
   - Go to [console.upstash.com](https://console.upstash.com)
   - Click "Create Database" → Select region → "Global" or closest to your users
   - Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

2. **Add to Vercel**:
   - Vercel Dashboard → Project → Settings → Environment Variables
   - Add both variables for **Production**, **Preview**, and **Development** environments

3. **Verify it works**:
   - Deploy to Vercel
   - Check logs: `[ShipIN] WARNING: Running in production with in-memory rate limiting` should **NOT** appear
   - Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) should appear on responses

### Verifying Rate Limiting

```bash
# Test rate limiting locally (with UPSTASH vars set)
curl -I http://localhost:3000/api/tracking/test

# Check headers:
# X-RateLimit-Limit: 30
# X-RateLimit-Remaining: 29
# X-RateLimit-Reset: <timestamp>
```

### Bundle Analysis

Run locally to inspect bundle composition:

```bash
npm run analyze
```

This opens an interactive treemap. Look for:
- `three` / `react-globe.gl` → Consider `lazy` + `ssr: false` (already done)
- `@splinetool/react-spline` → Already dynamically imported with `ssr: false`
- `framer-motion` → Consider if only used for simple animations
- Duplicate dependencies → Check for multiple versions of same package

### E2E Test Coverage

| Test File | Coverage |
|-----------|----------|
| `smoke.spec.ts` | Public pages, API health, security headers, auth redirects |
| `auth-flow.spec.ts` | Login page, protected route redirects, support flow redirects |

### Integration Test Coverage

| Test File | Coverage |
|-----------|----------|
| `login-intent/route.test.ts` | Rate limiting, auth headers, 429 responses |
| `tracking/[trackingId]/route.test.ts` | Public access, 404 handling, Cache-Control |
| `support/[ticketId]/message/route.test.ts` | Auth checks, role enforcement, validation |
| `paypal/create-order/route.test.ts` | Auth, validation, 404 handling |

### Sentry Monitoring

Required Vercel Environment Variables:
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | Sentry DSN for client-side tracking |
| `SENTRY_DSN` | Yes | Sentry DSN for server-side tracking |
| `SENTRY_AUTH_TOKEN` | Yes | Auth token for source map upload |

### Docker Deployment

Build and run locally:
```bash
# Build image
docker build -t shipin .

# Run container
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SENTRY_DSN=... \
  -e SENTRY_DSN=... \
  -e SENTRY_AUTH_TOKEN=... \
  -e UPSTASH_REDIS_REST_URL=... \
  -e UPSTASH_REDIS_REST_TOKEN=... \
  shipin
```

### Accessibility Audit

- Run locally: `npm test -- src/lib/axeScan.test.ts`
- CI runs automatically via `a11y` job
- Add `runAxeScan()` to any new page/component for runtime scans

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update with audit
npm audit fix

# Full update (careful with major versions)
npm update
npm test
npm run lint
npm run build
```

---

*Last updated: P0/P1/P2 hardening complete*