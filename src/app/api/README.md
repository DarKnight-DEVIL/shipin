# API Routes

Route handlers are the HTTP boundary. They validate input, authenticate the
caller, delegate to a feature service, and return JSON.

## Route Groups

| Group | Purpose |
| --- | --- |
| `auth/` | Login intent, MFA setup/verification, password leak checks |
| `requests/` | Customer request creation and request-level actions |
| `admin/requests/` | Admin request, warehouse, refund and shipment actions |
| `admin/shipments/` | Admin shipment updates |
| `admin/wallet/` | Admin wallet credits |
| `paypal/` | Order creation, capture, wallet top-ups |
| `payment/` | Wallet payment completion |
| `notifications/` | Notification create/read/delete, read-all, preferences |
| `addresses/` | Address book create/update/delete/default |
| `profile/` | Profile create/update and dashboard preferences |
| `support/` | Support ticket messages |
| `r2/` | Signed upload and view access |
| `send-email/` | Transactional email dispatch |
| `tracking/` | Public tracking lookups |
| `webhook/` | Payment provider callbacks |
| `whatsapp/` | WhatsApp test sends |

## Handler Pattern

```ts
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid request body.');
  }

  const data = schema.parse(body); // or safeParse + ValidationError
  const result = await featureService.execute(auth.profile.uid, data);

  return NextResponse.json(
    { success: true, ...result },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
});
```

## Rules

1. **Identity comes from the token.** Never accept `userId` from a customer
   body. Admin-only cross-user actions must verify the admin role.
2. **Validate every input.** Use `src/lib/validation` schemas or a local Zod
   schema. Unknown fields are stripped by Zod.
3. **Keep handlers thin.** Business rules and multi-step persistence belong in
   `src/features/*/services`.
4. **Use the shared auth guards.**
   - `requireAuth` — verified email, no profile lookup.
   - `requireAuthWithProfile` — verified email plus `users/{uid}`.
   - `requireAdmin` — admin role plus MFA verification.
5. **Errors.** Wrap with `withErrorHandler`; throw `ValidationError`,
   `NotFoundError`, `AuthorizationError`, etc. from `@/utils/errors`.
6. **Responses.** Success shape: `{ success: true, ...data }`. Error shape:
   `{ error, code?, details? }` (details only outside production).
7. **Caching.** Private responses must send `Cache-Control: no-store`.
8. **Server-only code.** Never import `firebase-admin` or other `server-only`
   modules from client components or client services.
9. **Client calls.** Use `customerApi` (`src/lib/customerApiClient.ts`) or
   `adminApi` (`src/lib/adminApiClient.ts`); both attach the Firebase ID token
   and normalize error responses.
