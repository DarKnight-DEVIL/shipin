/**
 * @fileoverview ShipIN API route contract.
 *
 * All endpoints live under `src/app/api/`. They share a uniform contract:
 *
 * 1. **Authentication** — use `@/lib/auth` guards (`requireAuthWithProfile`,
 *    `requireAdmin`) before reading the body. Never trust client-supplied IDs.
 * 2. **Validation** — parse the JSON body against a Zod schema from
 *    `@/lib/validation`. Throw `ValidationError` on failure.
 * 3. **Service delegation** — call a function from `@/features/*/services`.
 * 4. **Serialization** — return `{ success: true, ...data }` with
 *    `Cache-Control: no-store` on private responses.
 * 5. **Error wrapping** — every route handler is wrapped with
 *    `withErrorHandler` from `@/utils/errors` so all thrown errors produce a
 *    consistent JSON shape `{ error, code, details? }`.
 *
 * ## Route Catalog
 *
 * ### Customer-facing (`/api`)
 *
 * | Path | Method | Description |
 * |------|--------|-------------|
 * | `/api/addresses` | POST | Create address |
 * | `/api/addresses/:id` | PATCH, DELETE | Update / delete address |
 * | `/api/addresses/:id/default` | POST | Set default address |
 * | `/api/notifications` | GET, POST | List / create notification |
 * | `/api/notifications/:id` | PATCH, DELETE | Mark read / delete |
 * | `/api/notifications/read-all` | POST | Mark all read |
 * | `/api/notifications/clear-read` | POST | Clear read notifications |
 * | `/api/notifications/preferences` | PATCH | Save preferences |
 * | `/api/profile` | POST | Create / update profile |
 * | `/api/profile/preferences` | PATCH | Dashboard metric prefs |
 * | `/api/paypal/create-order` | POST | Begin PayPal order |
 * | `/api/paypal/capture-order` | POST | Capture PayPal order |
 * | `/api/paypal/create-wallet-topup` | POST | Begin wallet top-up |
 * | `/api/paypal/capture-wallet-topup` | POST | Capture wallet top-up |
 * | `/api/payment/complete-wallet` | POST | Complete wallet payment |
 * | `/api/r2/upload` | POST | Get signed upload URL |
 * | `/api/r2/view` | POST | Get signed view URL |
 * | `/api/send-email` | POST | Send transactional email |
 * | `/api/support/:ticketId/message` | POST | Send message on ticket |
 * | `/api/tracking/:trackingId` | GET | Public tracking lookup |
 * | `/api/webhook` | POST | PayPal webhook callback |
 * | `/api/whatsapp/test` | POST | Send test WhatsApp (admin) |
 *
 * ### Auth (`/api/auth`)
 *
 * | Path | Method | Description |
 * |------|--------|-------------|
 * | `/api/auth/login-intent` | POST | Pre-authenticate before MFA |
 * | `/api/auth/mfa/status` | GET | Check current MFA status |
 * | `/api/auth/mfa/session` | GET, DELETE | Start / end admin elevated session |
 * | `/api/auth/mfa/totp/setup` | POST | Initiate TOTP enrollment |
 * | `/api/auth/mfa/totp/verify` | POST | Verify TOTP code |
 * | `/api/auth/mfa/sms/setup` | POST | Initiate SMS enrollment |
 * | `/api/auth/mfa/sms/verify` | POST | Verify SMS code |
 * | `/api/auth/mfa/webauthn/register/start` | POST | Begin WebAuthn registration |
 * | `/api/auth/mfa/webauthn/register/complete` | POST | Complete WebAuthn |
 * | `/api/auth/mfa/webauthn/credentials` | DELETE | Remove credential |
 * | `/api/auth/password-leak-check` | POST | Have-I-Been-Pwned check |
 *
 * ### Admin (`/api/admin`)
 *
 * | Path | Method | Description |
 * |------|--------|-------------|
 * | `/api/admin/requests/:id/refund` | POST | Full refund (customer-initiated) |
 * | `/api/admin/requests/:id/refund-offer` | POST | Offer refund |
 * | `/api/admin/requests/:id/refund/complete` | POST | Complete refund |
 * | `/api/admin/requests/:id/refund/paypal` | POST | Refund via PayPal |
 * | `/api/admin/requests/:id/partial-refund` | POST | Initiate partial refund |
 * | `/api/admin/requests/:id/partial-refund/complete` | POST | Complete partial refund |
 * | `/api/admin/requests/:id/shipment` | POST | Assign shipment |
 * | `/api/admin/requests/:id/additional-items` | POST | Approve/reject add-on item |
 * | `/api/admin/requests/:id/approve-international` | POST | Approve intl shipping |
 * | `/api/admin/requests/:id/warehouse/checklist` | POST | Update warehouse checklist |
 * | `/api/admin/requests/:id/warehouse/inspection` | POST | Record inspection |
 * | `/api/admin/requests/:id/warehouse/inspection/photos` | POST | Upload inspection photos |
 * | `/api/admin/requests/:id/warehouse/storage-timer` | POST | Start storage timer |
 * | `/api/admin/shipments/:id` | PATCH | Update shipment |
 * | `/api/admin/wallet/credit` | POST | Admin wallet credit |
 */

