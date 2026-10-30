# ShipIN Security Audit Report

## Summary
This report documents the security hardening applied to the ShipIN website to address vulnerabilities and protect against common attacks.

## Security Controls Implemented

### 1. Rate Limiting
- Per-IP request caps: 100 req/min (web), 30 req/min (API), 10 req/min (strict)
- Middleware-based enforcement via `src/middleware.ts`
- In-memory store; for global limits, use Redis or edge/CDN rate limiting

### 2. Security Headers
All responses include:
- **Content-Security-Policy**: Strict policy blocking inline scripts, allowing trusted sources (PayPal, Google, Vercel analytics)
- **X-Frame-Options**: DENY (clickjacking protection)
- **Strict-Transport-Security**: max-age=31536000; includeSubDomains; preload
- **X-Content-Type-Options**: nosniff (MIME sniffing prevention)
- **Referrer-Policy**: strict-origin-when-cross-origin
- **X-XSS-Protection**: 0 (modern browsers)
- **Permissions-Policy**: Restricts camera, microphone, geolocation, payment, etc.
- **X-Robots-Tag**: noindex, nofollow

### 3. CORS Configuration
- Origin allowlist enforcement (production domains only)
- Credentials support for cookie/XHR auth flows
- Public API routes whitelisted for broader access

### 4. Authentication Layer (`src/lib/auth.ts`)
- `requireAuth`: Verifies Firebase ID token for any authenticated user
- `requireAuthWithProfile`: User + profile + optional role enforcement
- `requireAdmin`: Verified admin only (wrapped to return NextResponse with proper error codes)
- Token caching to reduce repeated verification calls
- Safe `extractAuth` helper that parses Authorization headers

### 5. Input Validation (`src/lib/validation.ts`)
Zod schemas for all untrusted inputs:
- Email validation (RFC-compliant regex)
- WhatsApp phone (digits only, 10-15 chars)
- Money amounts (finite, positive, max 2 decimals)
- ID format validation
- Message length limits (2000 chars max)
- Payment/refund method enums (closed sets)
- WhatsApp template names (known templates only)
- `validateBody()` function returns structured errors

### 6. Secured API Routes
| Route | Protection |
|-------|-----------|
| `POST /api/whatsapp/test` | Auth + phone validation + no error echo |
| `POST /api/send-email` | Admin auth + body validation + 60/min rate limit |
| `POST /api/support/[ticketId]/message` | Auth + ticket verification + message sanitization |
| Admin refund/partial-refund/refund-offer routes | Auth + requestId validation + body schemas |
| `POST /api/payment/complete-wallet` | Auth + body validation |
| R2 upload/view routes | Auth + strict input validation |
| Email send routes | Body validation + no relay |

### 7. Critical Security Fixes
- **WhatsApp test** — was open endpoint; now requires auth
- **Email API** — was open SMTP relay; now requires auth + validation + rate limit
- **Support messages** — was unauthenticated; now requires Firebase token
- **Admin routes** — now require verified admin token + input validation

### 8. Environment Configuration
- `.env.example` created with all required variables documented
- `.env*` already in `.gitignore` (prevents committing secrets)
- SMTP/ PayPal/ Firebase/ R2/ WhatsApp credentials all use environment variables

### 9. Debug Mode Shielding
- `X-Debug-Mode: disabled` header in production
- Stack traces and sensitive data hidden from error responses

## Remaining Items
- Create `firestore.rules` and `storage.rules` for Firebase Security Rules
- Upgrade Next.js from 16.3.8 to 16.4.3 (audit reports critical RCE vulnerabilities)
- Run `npm audit fix` for moderate/vulnerable packages
- Some customer-facing request routes may need auth (quote, refund, etc.)
- Add CSP nonce support if inline scripts are used

## Recommendations
1. **Immediate**: Upgrade Next.js to 16.4.3 to fix critical RCE vulnerabilities
2. **Short-term**: Create Firestore/Storage security rules
3. **Medium-term**: Add Redis-backed rate limiting for global distribution
4. **Ongoing**: Monitor npm advisories and regularly audit dependencies

## Files Modified
- `src/middleware.ts` — Rate limiting + security headers + CORS
- `src/lib/rateLimiter.ts` — Rate limiter implementation
- `src/lib/securityHeaders.ts` — Security header configuration
- `src/lib/cors.ts` — CORS configuration
- `src/lib/auth.ts` — Authentication layer
- `src/lib/validation.ts` — Zod input validation schemas
- `src/app/api/*` — Secured API routes (see table above)
- `src/app/api/send-email/route.ts` — Rewritten with auth + validation
- `src/app/api/whatsapp/test/route.ts` — Auth enforced
- `src/app/api/support/[ticketId]/message/route.ts` — Auth enforced
- `src/lib/emailDispatcher.ts` — New file for email sending
- `.env.example` — New file documenting required env vars
- `firestore.rules` — Firebase security rules
- `storage.rules` — Firebase storage security rules

---
*Last updated: Security hardening completed for ShipIN v0.1.0*