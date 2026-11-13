# API Response Convention

## Overview

All ShipIN API endpoints must follow a consistent response shape so that clients can reliably distinguish success from error without relying solely on HTTP status codes.

## Response Shape

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

or for simple responses:

```json
{
  "success": true
}
```

**Requirements:**
- Must include `success: true`
- May include additional data fields specific to the endpoint
- Used by routes wrapped with `withErrorHandler()` and manual routes alike

### Error Response

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "Machine-readable error code (optional)",
  "details": "Additional debug details (optional, production-safe)"
}
```

**Requirements:**
- Must include `success: false`
- `error`: Human-readable description shown to users
- `code`: Machine-readable error identifier (see Error Codes table below)
- `details`: Only included in non-production environments (`NODE_ENV !== 'production'`)

## Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `AUTHENTICATION_REQUIRED` | 401 | Authentication token required |
| `INVALID_AUTHENTICATION` | 401 | Invalid/authenticated token |
| `USER_PROFILE_NOT_FOUND` | 403 | User profile not found in database |
| `ADMIN_ACCESS_REQUIRED` | 403 | Administrator access required |
| `MFA_REQUIRED` | 401 | Multi-factor authentication required |
| `MFA_SETUP_REQUIRED` | 403 | MFA setup required for admin accounts |
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `NOT_FOUND` | 404 | Requested resource not found |
| `RATE_LIMIT_ERROR` | 429 | Too many requests |
| `PAYMENT_ERROR` | 402 | Payment processing failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| --- |
| `INVALID_PHONE_NUMBER` | 400 | SMS phone number not in E.164 format |
| `INVALID_VERIFICATION_CODE` | 400 | Verification code format invalid or no match |
| `SMS_VERIFICATION_NOT_PENDING` | 400 | No pending SMS verification found |
| `SMS_CODE_EXPIRED` | 400 | SMS code has expired |
| `INVALID_TOTP_CODE` | 400 | TOTP code invalid or wrong format |
| `TOTP_NOT_SETUP` | 400 | TOTP not yet configured |
| `UNKNOWN_WEBAUTHN_CREDENTIAL` | 400 | Credential ID not recognized |
| `INVALID_JSON` | 400 | Malformed request JSON |
| `INVALID_REQUEST_BODY` | 400 | Missing or invalid request fields |
| `INVALID_REQUEST_ID` | 400 | Request ID missing or invalid |
| `ADMIN_REFUND_ONLY_PURCHASED` | 400 | Admin refund only allowed for purchased requests |
| `REFUND_ALREADY_EXISTS` | 400 | Refund workflow already exists |
| `NO_PAYMENT_FOUND` | 400 | No payment record found for request |
| `INVALID_PAYMENT_BREAKDOWN` | 400 | Payment wallet/paypal amounts invalid |
| `REASON_REQUIRED` | 400 | Refund reason is required |
| `REQUEST_NOT_PURCHASED` | 400 | Refund can only be offered after purchase |
| `REFUND_REQUEST_EXISTS` | 400 | A refund request already exists |
| `REFUND_ALREADY_OFFERED` | 400 | A refund has already been offered |
| `CUSTOMER_ID_REQUIRED` | 400 | Customer ID is required |
| `AMOUNT_EXCEEDS_LIMIT` | 400 | Amount exceeds max allowed |
| `REQUEST_ID_REQUIRED` | 400 | Request ID required for refund |
| `NO_PARTIAL_REFUND_OFFER` | 400 | No partial refund offer exists |
| `OFFER_NOT_ACCEPTED` | 400 | Partial refund not yet accepted |
| `OFFER_NOT_ORIGINAL_PAYMENT` | 400 | Offer not accepted via original payment |
| `REFUND_EXCEEDS_SOURCES` | 400 | Refund exceeds original payment sources |
| `PAYPAL_REFUND_ID_REQUIRED` | 400 | PayPal refund ID required |
| `ALREADY_COMPLETED` | 400 | Payment/action already completed |
| `INVALID_ORDER_ID` | 400 | PayPal Order ID missing |
| `INVALID_AMOUNT` | 400 | Amount invalid or non-positive |
| `INVALID_TOPUP_AMOUNT` | 400 | Top-up amount out of allowed range |
| `INVALID_PAYMENT_TYPE` | 400 | Payment type not main or additional_item |
| `INVALID_ADDITIONAL_ITEM_REQUIRED` | 400 | Additional item ID required |
| `PAYPAL_CAPTURE_FAILED` | 400 | PayPal capture failed |
| `PAYPAL_NOT_COMPLETED` | 400 | PayPal payment not completed |
| `PAYPAL_CAPTURE_NOT_FOUND` | 400 | Capture details not found |
| `PAYPAL_CAPTURE_ID_NOT_FOUND` | 400 | Capture ID missing |
| `INVALID_CAPTURE_AMOUNT` | 400 | Captured amount invalid |
| `INVALID_CURRENCY` | 400 | Unexpected currency |
| `CAPTURE_AMOUNT_MISMATCH` | 400 | Captured amount != expected |
| `PAYPAL_AMOUNT_MISMATCH` | 400 | PayPal amount != expected |
| `PAYPAL_CAPTURE_NOT_FOUND` | 400 | Capture not found |
| `AMOUNT_MISMATCH` | 400 | Amount mismatch |
| `PAYMENT_NOT_BELONG_TO_ORDER` | 403 | Payment does not belong to order |
| `PAYMENT_TYPE_MISMATCH` | 403 | Payment type mismatch |
| `ADDITIONAL_ITEM_MISMATCH` | 403 | Additional item mismatch |
| `PAYMENT_NOT_BELONG_TO_ACCOUNT` | 403 | Payment does not belong to account |
| `ADDITIONAL_ITEM_NOT_FOUND` | 404 | Additional item request not found |
| `ADDITIONAL_ITEM_NOT_AWAITING_PAYMENT` | 400 | Additional item not awaiting payment |
| `ADDITIONAL_ITEM_AMOUNT_MISMATCH` | 400 | Additional item amount mismatch |
| `INVALID_PAYMENT_CALCULATION` | 400 | Stored payment calculation invalid |
| `PAYMENT_CALCULATION_MISMATCH` | 400 | Payment calculation mismatch |
| `WALLET_TOPUP_ORDER_NOT_FOUND` | 404 | Wallet top-up order not found |
| `WALLET_TOPUP_NOT_BELONG_TO_ACCOUNT` | 403 | Top-up not belonging to account |
| `WALLET_TOPUP_AMOUNT_MISMATCH` | 400 | Top-up amount mismatch |
| `WALLET_TOPUP_CAPTURE_FAILED` | 500 | Wallet top-up capture failed |
| `WEBHOOK_NOT_CONFIGURED` | 500 | Webhook not configured |
| `INVALID_WEBHOOK_SIGNATURE` | 400 | Invalid webhook signature |

## Conventions

### 1. `withErrorHandler` Wrapper

All routes should use the `withErrorHandler` wrapper from `@/utils/errors`. It automatically:

- Catches thrown errors
- Converts them to the standardized error shape via `serializeError()`
- Returns appropriate HTTP status codes
- Logs errors to console for debugging

**Example:**

```typescript
import { withErrorHandler } from "@/utils/errors";

export const POST = withErrorHandler(async (request: Request) => {
  // ... handler logic
  // On success: returns NextResponse.json({ success: true, data })
  // On error: returns NextResponse.json({ success: false, error, code, details }, { status })
});
```

### 2. Manual Error Responses

Routes that don't use `withErrorHandler` must also return the standardized shape:

**Before (inconsistent):**
```typescript
return NextResponse.json({ error: "User not found." }, { status: 404 });
```

**After (consistent):**
```typescript
return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
```

### 3. Success Responses

Success responses should include the data relevant to the endpoint. The `success: true` flag is mandatory.

**Example (create-order route):**
```json
{
  "success": true,
  "orderId": "order_123",
  "amount": 100.00,
  "baseAmount": 104.92,
  "processingFee": 4.92,
  "totalRequired": 104.92,
  "walletApplied": 0,
  "paypalAmount": 100.00
}
```

**Example (partial-refund route):**
```json
{
  "success": true,
  "requestId": "req_123",
  "offer": {
    "id": "offer_123",
    "amount": 50.00,
    "reason": "Customer return",
    "status": "offered"
  },
  "remainingRefundable": 150.00
}
```

## Migration Guide

If you have existing routes that don't follow this convention:

1. **Routes using `withErrorHandler`**: No changes needed — the wrapper already produces the correct shape.

2. **Routes manually returning errors**: Update from:
   ```typescript
   return NextResponse.json({ error: "message" }, { status });
   ```
   to:
   ```typescript
   return NextResponse.json({ success: false, error: "message", code: 'CODE' }, { status });
   ```

3. **Routes manually returning success**: Update from:
   ```typescript
   return NextResponse.json({ data: ..., message: "..." });
   ```
   to:
   ```typescript
   return NextResponse.json({ success: true, data, message: "..." });
   ```

## Error authoring in routes

- Throw `createShipINError(message, code, status)` for expected failure paths.
- Use `withErrorHandler` to catch throws and convert them to the standard error shape.
- For early-return validation cases, return the canonical error payload directly:
   ```typescript
   return NextResponse.json({
     success: false,
     error: "...",
     code: '...',
   }, { status: 400 });
   ```

Legacy sentinel strings (`new Error("SENTINEL_CODE")`) are mapped centrally by `toShipINError` via `SENTINEL_ERROR_MAP`, but new code should prefer `createShipINError` directly.

## Documentation locations

- API response convention: `src/utils/errors/response-convention.md`
- Error classes and helpers: `src/utils/errors/index.ts`
- Error code list: this file

## Example: Full Error Flow

When a route throws an `AuthenticationError`:

1. `withErrorHandler` catches the error
2. `toShipINError()` maps it using the sentinel map → `AuthenticationError` (code: `AUTHENTICATION_REQUIRED`, status: 401)
3. `serializeError()` produces: `{ success: false, error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }`
4. Response: `NextResponse.json({ success: false, error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" }, { status: 401 })`

## Example: Full Success Flow

When a route completes successfully:

1. Handler returns a result object
2. `withErrorHandler` returns: `NextResponse.json({ success: true, ...result }, { status: 200 })`
3. Response: `NextResponse.json({ success: true, orderId: "...", amount: ... }, { status: 200 })`