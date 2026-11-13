/**
 * Centralized application constants.
 *
 * All magic numbers live here so they can be documented, reviewed, and
 * changed in one place. Never hardcode a timeout, fee, or limit directly
 * in a service or route handler.
 */

// ---------------------------------------------------------------------------
// HTTP / Network
// ---------------------------------------------------------------------------

/** Default timeout for outbound HTTP requests (ms). */
export const HTTP_TIMEOUT_MS = 15_000;

/** Timeout for SMTP connection establishment (ms). */
export const SMTP_CONNECTION_TIMEOUT_MS = 15_000;

/** Timeout for SMTP greeting handshake (ms). */
export const SMTP_GREETING_TIMEOUT_MS = 10_000;

/** Timeout for SMTP socket idle (ms). */
export const SMTP_SOCKET_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// PayPal
// ---------------------------------------------------------------------------

/** PayPal processing fee percentage (4.4%). */
export const PAYPAL_PERCENTAGE = 0.044;

/** PayPal fixed processing fee ($0.30). */
export const PAYPAL_FIXED_FEE = 0.30;

/** PayPal currency code for all transactions. */
export const PAYPAL_CURRENCY = "USD" as const;

/** Default PayPal API timeout (ms). */
export const PAYPAL_TIMEOUT_MS = HTTP_TIMEOUT_MS;

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

/** Web page rate limit: requests per minute per IP. */
export const WEB_RATE_LIMIT = 100;
/** API route rate limit: requests per minute per IP. */
export const API_RATE_LIMIT = 30;
/** Strict rate limit: requests per minute per IP (login, sensitive ops). */
export const STRICT_RATE_LIMIT = 10;
/** Login attempt limit: attempts per minute per IP. */
export const LOGIN_RATE_LIMIT = 5;
/** Rate limit window in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// MFA
// ---------------------------------------------------------------------------

/** MFA session lifetime (30 minutes). */
export const MFA_SESSION_TTL_MS = 30 * 60 * 1000;
/** TOTP time step in seconds (RFC 6238 standard). */
export const TOTP_PERIOD = 30;
/** Number of backup codes generated per enrollment. */
export const BACKUP_CODE_COUNT = 10;
/** SMS code validity window (5 minutes). */
export const SMS_CODE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Validation Limits
// ---------------------------------------------------------------------------

/** Maximum length of a free-text message (characters). */
export const MAX_MESSAGE_LENGTH = 2000;
/** Maximum length of a display name (characters). */
export const MAX_NAME_LENGTH = 100;
/** Maximum length of a label (characters). */
export const MAX_LABEL_LENGTH = 50;
/** Maximum length of an ID (characters). */
export const MAX_ID_LENGTH = 64;
/** Maximum length of an email address (characters). */
export const MAX_EMAIL_LENGTH = 255;
/** Maximum length of an object key (characters). */
export const MAX_OBJECT_KEY_LENGTH = 512;
/** Maximum length of a PayPal order ID (characters). */
export const MAX_ORDER_ID_LENGTH = 64;
/** Maximum length of a PayPal refund transaction ID (characters). */
export const MAX_REFUND_TX_ID_LENGTH = 128;
/** Maximum amount allowed for a single transaction (USD). */
export const MAX_MONEY_AMOUNT = 999_999_999;
/** Maximum description length for wallet top-up (characters). */
export const MAX_TOPUP_DESCRIPTION_LENGTH = 200;