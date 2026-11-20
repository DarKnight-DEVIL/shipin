/***
 * PayPal Sandbox API Response Fixtures
 *
 * Centralized test fixtures for PayPal API responses used across paypal.test.ts.
 * All values are sandbox test values; never commit real credentials.
 *
 * Usage: import { SUCCESS_VERIFICATION_RESPONSE, OAUTH_TOKEN_RESPONSE, etc. } from '@/lib/paypal/__fixtures__/paypal-responses'
 */

/// ============================================================================
/// OAuth Token Response Fixtures
/// ============================================================================

/** Successful OAuth token response from PayPal */
export const OAUTH_TOKEN_RESPONSE = {
  ok: true,
  json: async () => ({
    access_token: "A21AAIdPJ4u9uw6e9S3 unique_token_string",
    expires_in: 28800,
    token_type: "Bearer",
  }),
};

/** Failed OAuth token response (invalid client) */
export const OAUTH_TOKEN_FAILED_RESPONSE = {
  ok: false,
  status: 401,
  json: async () => ({
    error: "invalid_client",
    error_description: "Client authentication failed",
  }),
};

/** Failed OAuth token response (server error) */
export const OAUTH_TOKEN_SERVER_ERROR_RESPONSE = {
  ok: false,
  status: 500,
  json: async () => ({
    error: "invalid_server_response",
    error_description: "Internal server error",
  }),
};

/// ============================================================================
/// Webhook Verification Response Fixtures
/// ============================================================================

/** Successful webhook verification response */
export const SUCCESS_VERIFICATION_RESPONSE = {
  ok: true,
  json: async () => ({
    verification_status: "SUCCESS",
  }),
};

/** Failed webhook verification response */
export const FAILURE_VERIFICATION_RESPONSE = {
  ok: true,
  json: async () => ({
    verification_status: "FAILURE",
  }),
};

/** Webhook verification non-OK response (500 error) */
export const NON_OK_VERIFICATION_RESPONSE = {
  ok: false,
  status: 500,
};

/** Webhook verification with transmission failures */
export const TRANSMISSION_FAILURE_RESPONSE = {
  ok: false,
  status: 400,
  json: async () => ({
    message: "Invalid transmission format",
  }),
};

/// ============================================================================
/// Order/Invoice Verification Response Fixtures
/// ============================================================================

/** Successful order verification response */
export const SUCCESS_ORDER_RESPONSE = {
  ok: true,
  json: async () => ({
    id: "INVOIC-1234567890",
    status: "APPROVED",
    purchase_units: [
      {
        reference_id: "ref_1",
        amount: {
          currency_code: "USD",
          value: "99.99",
        },
        payee: {
          email_address: "test@example.com",
        },
      },
    ],
  }),
};

/** Order not found response */
export const ORDER_NOT_FOUND_RESPONSE = {
  ok: false,
  status: 404,
  json: async () => ({
    error: "not_found",
    message: "The specified resource was not found.",
  }),
};

/** Order declined response */
export const ORDER_DECLINED_RESPONSE = {
  ok: true,
  json: async () => ({
    id: "INVOIC-1234567890",
    status: "DECLINED",
    purchase_units: [],
  }),
};

/** Order pending response */
export const ORDER_PENDING_RESPONSE = {
  ok: true,
  json: async () => ({
    id: "INVOIC-1234567890",
    status: "PENDING",
    purchase_units: [
      {
        reference_id: "ref_1",
        amount: {
          currency_code: "USD",
          value: "50.00",
        },
      },
    ],
  }),
};

/// ============================================================================
/// Capture Response Fixtures
/// ============================================================================

/** Successful capture response */
export const SUCCESS_CAPTURE_RESPONSE = {
  ok: true,
  json: async () => ({
    id: "CAPTURE-1234567890",
    status: "COMPLETED",
    purchase_amount: {
      currency_code: "USD",
      value: "99.99",
    },
  }),
};

/** Failed capture response */
export const FAILED_CAPTURE_RESPONSE = {
  ok: false,
  status: 422,
  json: async () => ({
    name: "INVALID_REQUEST_ERROR",
    message: "Invalid capture request",
    debug_id: "aaa111bbb222",
  }),
};

/** Capture not found response */
export const CAPTURE_NOT_FOUND_RESPONSE = {
  ok: false,
  status: 404,
};

/// ============================================================================
/// Refund Response Fixtures
/// ============================================================================

/** Successful refund response (full) */
export const SUCCESS_REFUND_FULL_RESPONSE = {
  ok: true,
  json: async () => ({
    id: "REFUND-1234567890",
    status: "COMPLETED",
    amount: {
      currency_code: "USD",
      value: "99.99",
    },
  }),
};

/** Successful refund response (partial) */
export const SUCCESS_REFUND_PARTIAL_RESPONSE = {
  ok: true,
  json: async () => ({
    id: "REFUND-1234567890",
    status: "COMPLETED",
    amount: {
      currency_code: "USD",
      value: "25.00",
    },
  }),
};

/** Failed refund response */
export const FAILED_REFUND_RESPONSE = {
  ok: false,
  status: 400,
  json: async () => ({
    name: "INVALID_REQUEST_ERROR",
    message: "Invalid refund request",
    debug_id: "aaa111bbb222",
  }),
};

/** Refund not found response */
export const REFUND_NOT_FOUND_RESPONSE = {
  ok: false,
  status: 404,
};

/// ============================================================================
/// Refund Body Fixtures (for request payloads)
/// ============================================================================

/** Full refund body */
export const REFUND_BODY_FULL = {
  amount: {
    currency_code: "USD",
    value: "99.99",
  },
};

/** Partial refund body */
export const REFUND_BODY_PARTIAL = {
  amount: {
    currency_code: "USD",
    value: "25.00",
  },
};

/** Empty refund body (full refund) */
export const REFUND_BODY_EMPTY = {};

/// ============================================================================
/// Order Create Request Fixtures
/// ============================================================================

/** Minimal order create body */
export const ORDER_CREATE_BODY_MINIMAL = {
  intent: "CAPTURE",
  purchase_units: [
    {
      amount: {
        currency_code: "USD",
        value: "99.99",
      },
    },
  ],
};

/** Order create body with description */
export const ORDER_CREATE_BODY_WITH_DESC = {
  intent: "CAPTURE",
  purchase_units: [
    {
      amount: {
        currency_code: "USD",
        value: "50.00",
      },
      description: "Test purchase - ShipIN wallet top-up",
    },
  ],
};

/** Order create body with quantity */
export const ORDER_CREATE_BODY_WITH_QUANTITY = {
  intent: "CAPTURE",
  purchase_units: [
    {
      amount: {
        currency_code: "USD",
        value: "10.00",
      },
      quantity: 3,
    },
  ],
};

/// ============================================================================
/// Webhook Header Fixtures
/// ============================================================================

/** Standard webhook verification headers (test values) */
export const WEBHOOK_VERIFICATION_HEADERS = new Headers({
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://www.paypal.com/webapps/checkout/cert",
  "paypal-transmission-id": "test-transmission-id",
  "paypal-transmission-sig": "test-sig",
  "paypal-transmission-time": "2026-01-01T00:00:00Z",
});

/** Invalid algorithm header */
export const INVALID_ALGO_HEADERS = new Headers({
  "paypal-auth-algo": "INVALID-SHA256withRSA",
  "paypal-cert-url": "https://www.paypal.com/webapps/checkout/cert",
  "paypal-transmission-id": "test-transmission-id",
  "paypal-transmission-sig": "test-sig",
  "paypal-transmission-time": "2026-01-01T00:00:00Z",
});

/** Missing transmission signature */
export const MISSING_SIG_HEADERS = new Headers({
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://www.paypal.com/webapps/checkout/cert",
  "paypal-transmission-id": "test-transmission-id",
  "paypal-transmission-time": "2026-01-01T00:00:00Z",
});

/** Different timestamp (replay attack) */
export const REPLAY_ATTACK_HEADERS = new Headers({
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://www.paypal.com/webapps/checkout/cert",
  "paypal-transmission-id": "old-transmission-id",
  "paypal-transmission-sig": "old-signature",
  "paypal-transmission-time": "2025-01-01T00:00:00Z",
});

/** Invalid timestamp format */
export const INVALID_TIMESTAMP_HEADERS = new Headers({
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://www.paypal.com/webapps/checkout/cert",
  "paypal-transmission-id": "test-transmission-id",
  "paypal-transmission-sig": "test-sig",
  "paypal-transmission-time": "not-a-date",
});

/// ============================================================================
/// Error Code Fixtures
/// ============================================================================

/** PayPal webhook verification unavailable error */
export const PAYPAL_WEBHOOK_UNAVAILABLE_ERROR = {
  code: "PAYPAL_WEBHOOK_UNAVAILABLE",
  message: "PayPal webhook verification is unavailable",
};

/** PayPal authentication error */
export const PAYPAL_AUTH_ERROR = {
  code: "PAYPAL_AUTH_ERROR",
  message: "Failed to obtain PayPal access token",
  status: 502,
};

/** PayPal configuration error (missing client id/secret) */
export const PAYPAL_CONFIG_ERROR = {
  code: "PAYPAL_CONFIG_ERROR",
  message: "PayPal not configured - missing client ID or secret",
  status: 500,
};

/** PayPal verify order error */
export const PAYPAL_VERIFY_ERROR = {
  code: "PAYPAL_VERIFY_ERROR",
  message: "Failed to verify PayPal order",
  status: 502,
};

/** PayPal capture error */
export const PAYPAL_CAPTURE_ERROR = {
  code: "PAYPAL_CAPTURE_ERROR",
  message: "Failed to capture PayPal order",
  status: 502,
};

/** PayPal refund error */
export const PAYPAL_REFUND_ERROR = {
  code: "PAYPAL_REFUND_ERROR",
  message: "Failed to process PayPal refund",
  status: 502,
};

/** PayPal order already captured error (duplicate) */
export const PAYPAL_DUPLICATE_CAPTURE_ERROR = {
  code: "PAYPAL_DUPLICATE_CAPTURE",
  message: "Order already captured",
  status: 400,
};

/** PayPL verification status values */
export const VERIFICATION_STATUS = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  PENDING: "PENDING",
};

/** PayPal order status values */
export const ORDER_STATUS = {
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};
