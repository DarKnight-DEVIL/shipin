/**
 * Server-side input validation schemas for ShipIN.
 *
 * Zod is used to validate ALL untrusted input before it reaches
 * business logic. Rules:
 *
 *   1. Every API route must validate its JSON body against a schema.
 *   2. Never trust frontend validation — the schema is the source of truth.
 *   3. Trim strings and coerce types defensively.
 *   4. Fail closed: on invalid input return 400, never proceed.
 *
 * Error messages are generic (no internal detail leaked).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

/** Email with basic RFC-ish shape check. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(255, "Email is too long.")
  .regex(
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/i,
    "Invalid email address."
  );

/** A single WhatsApp phone number (digits only). */
export const whatsappPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required.")
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 15, "Invalid phone number.");

/** A money amount: finite, positive, at most 2 decimals. */
export const moneySchema = z
  .number({ error: "Amount must be a valid number." })
  .finite("Amount must be a valid number.")
  .positive("Amount must be greater than zero.")
  .max(999999999, "Amount exceeds maximum allowed.")
  .refine(
    (n) =>
      Number.isFinite(n) && Math.round((n + Number.EPSILON) * 100) / 100 === n,
    "Amount must have at most 2 decimal places."
  );

/** A Firestore document ID (alphanumeric, short, bounded). */
export const idSchema = z
  .string()
  .trim()
  .min(1, "ID is required.")
  .max(64, "ID is too long.")
  .regex(/^[a-zA-Z0-9_-]+$/, "ID contains invalid characters.");

/**
 * A Firestore document ID whose messages name the field they belong to.
 *
 * `idSchema` answers "ID contains invalid characters.", which a JSON body
 * surfaced verbatim: the caller was told something about "ID" without being
 * told which field the server rejected. Body schemas use this; a lone route
 * param can keep `idSchema`.
 */
export function namedIdSchema(label: string) {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(64, `${label} is too long.`)
    .regex(/^[a-zA-Z0-9_-]+$/, `${label} contains invalid characters.`);
}

/** Free-text message: no HTML, no scripts, bounded length. */
export const messageSchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty.")
  .max(2000, "Message is too long (max 2000 characters).");

/** Admin ticket/support reason. */
export const adminReasonSchema = messageSchema;

/** Short label: 1-50 chars, limited character set. */
export const labelSchema = z
  .string()
  .trim()
  .min(1, "Label is required.")
  .max(50, "Label is too long.")
  .regex(/^[A-Za-z0-9\s-]+$/, "Label contains invalid characters.");

/** PayPal payment type enum. */
export const paymentTypeSchema = z.enum(["main", "additional_item"], {
  error: "Invalid payment type.",
});

/** Refund method enum. */
export const refundMethodSchema = z.enum([
  "wallet",
  "original_payment",
  "paypal",
]);

/** WhatsApp template name enum (lock to known templates). */
export const whatsappTemplateSchema = z.enum([
  "hello_world",
  "shipin_payment_received",
  "shipin_support_update",
]);

// ---------------------------------------------------------------------------
// API request bodies
// ---------------------------------------------------------------------------

/** POST /api/send-email and universal email wrapper. */
export const sendEmailBodySchema = z.object({
  type: z
    .enum([
      "quote",
      "payment",
      "shipment",
      "shipped",
      "delivered",
      "refunded",
      "support",
    ])
    .optional(),
  email: emailSchema,
  requestId: idSchema.optional(),
  amount: moneySchema.optional(),
  trackingNumber: idSchema.optional(),
  supportMessage: messageSchema.optional(),
});

/** POST /api/support/[ticketId]/message */
export const supportMessageBodySchema = z.object({
  sender: z.enum(["admin", "customer"]),
  message: messageSchema,
});

/** POST /api/admin/wallet/credit */
export const adminCreditBodySchema = z.object({
  customerId: idSchema,
  amount: moneySchema,
  type: z.enum(["credit", "refund"]).optional(),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default("Credit issued by admin"),
  requestId: idSchema.optional().nullable(),
});

/** POST /api/admin/requests/[id]/refund */
export const adminRefundBodySchema = z.object({
  reason: adminReasonSchema.optional(),
});

/** POST /api/admin/requests/[id]/partial-refund */
export const partialRefundBodySchema = z.object({
  amount: moneySchema,
  reason: adminReasonSchema.optional(),
  method: refundMethodSchema.optional(),
});

/** POST /api/admin/requests/[id]/partial-refund/complete */
export const completePartialRefundBodySchema = z.object({
  paypalRefundTransactionId: z.string().trim().max(128).optional().default(""),
});

/** POST /api/admin/requests/[id]/refund/paypal */
export const paypalRefundBodySchema = z.object({
  amount: moneySchema,
  transactionId: z
    .string()
    .trim()
    .min(1, "Transaction ID is required.")
    .max(128, "Transaction ID is too long."),
});

/** POST /api/requests/[id]/refund (customer) */
export const customerRefundBodySchema = z.object({
  method: refundMethodSchema,
  amount: moneySchema,
  reason: messageSchema.optional(),
});

// ---------------------------------------------------------------------------
// Quote workflow
// ---------------------------------------------------------------------------

/** A money amount that is allowed to be zero (quote line components). */
const zeroableMoneySchema = z
  .number()
  .finite("Amount must be a valid number.")
  .min(0, "Amount cannot be negative.")
  .max(999999999, "Amount exceeds maximum allowed.")
  .refine(
    (n) => Math.round((n + Number.EPSILON) * 100) / 100 === n,
    "Amount must have at most 2 decimal places."
  );

/** POST /api/requests/[id]/request-new-quote */
export const newQuoteBodySchema = z.object({
  requestId: idSchema.optional(),
});

/** One line of a quotation. */
export const quoteItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required.").max(200),
  quantity: z.number().int().min(1).max(999),
  url: z.string().trim().max(2048).optional(),
  unitPrice: zeroableMoneySchema.optional(),
  subtotal: zeroableMoneySchema.optional(),
});

/** The priced breakdown of a quotation. */
export const quoteBreakdownSchema = z.object({
  productsTotal: zeroableMoneySchema,
  domesticShipping: zeroableMoneySchema,
  internationalShipping: zeroableMoneySchema,
  serviceFee: zeroableMoneySchema,
  inspectionFee: zeroableMoneySchema.optional(),
  holdFee: zeroableMoneySchema.optional(),
  grandTotal: zeroableMoneySchema,
});

/**
 * POST /api/requests/[id]/quote
 *
 * Only the priced content is accepted: version, timestamps, acceptance and the
 * expiry are derived server-side so a client cannot extend its own quote or
 * claim one was accepted.
 */
export const quoteBodySchema = z.object({
  requestId: idSchema.optional(),
  quote: z.object({
    items: z
      .array(quoteItemSchema)
      .min(1, "A quote needs at least one item.")
      .max(100),
    breakdown: quoteBreakdownSchema,
    serviceFeeRule: z.string().trim().max(200).optional(),
  }),
  quoteRegenerationRequested: z.boolean().optional(),
});

/** PATCH /api/requests/[id]/status (admin) */
export const requestStatusEnum = z.enum([
  "submitted",
  "review",
  "awaiting_payment",
  "paid",
  "purchased",
  "warehouse_received",
  "ready_for_international_shipping",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "refund_requested",
  "refund_offered",
  "refunded",
  "rejected",
]);

export const requestStatusBodySchema = z.object({
  status: requestStatusEnum,
  rejectionReason: z.string().trim().max(500).optional(),
});

/**
 * PATCH /api/admin/requests/[id]/purchase (admin)
 *
 * One store's purchase. Optional keys are simply absent when the admin leaves
 * the field blank; `amount` is what was actually paid at that store.
 */
export const purchaseBodySchema = z.object({
  vendor: z.string().trim().min(1, "Vendor is required.").max(120),
  orderNumber: z.string().trim().max(120).optional(),
  amount: moneySchema,
  receiptUrl: z
    .string()
    .trim()
    .url("Enter a valid receipt link.")
    .max(2048)
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

/** PATCH /api/requests/[id]/shipment-status (admin) */
export const shipmentStatusBodySchema = z.object({
  requestId: idSchema.optional(),
  status: z.enum(["shipped", "out_for_delivery", "delivered"]),
});

/**
 * POST /api/paypal/create-order.
 *
 * One schema for the whole payload. It used to be split in two — the ids in
 * `createOrderIdsSchema`, the amount and type hand-checked — so the same fields
 * were defined twice and only one copy named the rejected field. Both ids use
 * `namedIdSchema` here so a value Firestore cannot accept as a document id is a
 * 400 saying "Request ID" rather than a 500 from inside the Admin SDK.
 */
export const createOrderBodySchema = z.object({
  requestId: namedIdSchema("Request ID"),
  amount: moneySchema,
  paymentType: paymentTypeSchema.optional().default("main"),
  additionalItemRequestId: namedIdSchema(
    "Additional item request ID"
  ).optional(),
});

/** POST /api/paypal/capture-order */
export const captureOrderBodySchema = z.object({
  requestId: namedIdSchema("Request ID"),
  // Also the Firestore document id for `paypalPaymentOrders/{orderID}`, so the
  // charset is a path-safety rule and not just cosmetics: "/" is rejected here
  // rather than throwing inside the Admin SDK when `.doc(orderID)` runs.
  orderID: z
    .string()
    .trim()
    .min(1, "Order ID is required.")
    .max(64, "Order ID is too long.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Order ID contains invalid characters."),
  amount: moneySchema,
  paymentType: paymentTypeSchema.optional().default("main"),
  additionalItemRequestId: namedIdSchema(
    "Additional item request ID"
  ).optional(),
});

/** POST /api/paypal/create-wallet-topup */
export const createTopupBodySchema = z.object({
  amount: moneySchema,
  description: z.string().trim().max(200).optional(),
});

/**
 * POST /api/paypal/capture-wallet-topup.
 *
 * `orderID` becomes `walletTopupOrders/{orderID}`, so it needs the same
 * path-safety rule as every other id that reaches `.doc()`; `amount` is the
 * same money rule the creation route uses, instead of a hand-written positivity
 * check that accepted 10.123.
 */
export const captureTopupBodySchema = z.object({
  orderID: namedIdSchema("PayPal Order ID"),
  amount: moneySchema,
});

/**
 * POST /api/payment/complete-wallet.
 *
 * The request id is the whole body: the amount due is priced from the stored
 * quote inside the transaction, so a client-sent amount is not accepted (and,
 * because the object strips unknown keys, cannot influence the charge if one is
 * still sent).
 */
export const completeWalletBodySchema = z.object({
  requestId: namedIdSchema("Request ID"),
});

/** POST /api/whatsapp/test */
export const whatsappTestBodySchema = z.object({
  phone: whatsappPhoneSchema,
});

// ---------------------------------------------------------------------------
// Admin: users, request workflow, shipments
// ---------------------------------------------------------------------------

/** PATCH /api/admin/users — a role change. */
export const adminUserRoleBodySchema = z.object({
  uid: namedIdSchema("User ID"),
  role: z.enum(["admin", "customer"], {
    error: "Role must be 'admin' or 'customer'.",
  }),
});

/**
 * PATCH /api/admin/requests/[id]/additional-items.
 *
 * The additional-item records are written back wholesale, so their inner shape
 * is the client's; what the schema owns is that the body is an object, the
 * list is bounded, and an optional status is a real status.
 */
export const additionalItemsBodySchema = z.object({
  additionalItemRequests: z.array(z.record(z.string(), z.unknown())).max(100),
  status: requestStatusEnum.optional(),
  orderChange: z.record(z.string(), z.unknown()).optional(),
});

/** POST /api/admin/requests/[id]/refund-offer */
export const refundOfferBodySchema = z.object({
  reason: adminReasonSchema,
});

/**
 * POST /api/admin/requests/[id]/shipment — record the carrier tracking.
 *
 * `createdAt` is the shipment creation time an edit must preserve, passed
 * through as the client serialized it (a Firestore timestamp shape), so it is
 * not validated beyond "present or absent".
 */
export const shipmentBodySchema = z.object({
  internalTrackingId: idSchema.optional(),
  carrier: labelSchema,
  trackingNumber: z
    .string()
    .trim()
    .min(1, "Tracking number is required.")
    .max(120, "Tracking number is too long."),
  estimatedDelivery: z.string().trim().max(60).optional(),
  trackingUrl: z.string().trim().max(2048).optional(),
  createdAt: z.unknown().optional(),
});

/**
 * PATCH /api/admin/shipments/[shipmentId].
 *
 * The weight/dimension fields keep the route's own `readDimension` check so
 * its specific error message survives; the schema owns the parse guard and
 * the two text fields.
 */
export const shipmentUpdateBodySchema = z.object({
  courier: z.string().trim().max(120).optional(),
  tracking: z.string().trim().max(120).optional(),
  weight: z.unknown().optional(),
  length: z.unknown().optional(),
  width: z.unknown().optional(),
  height: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// Auth: MFA step-up and password utilities
// ---------------------------------------------------------------------------

/** A six-digit TOTP code, tolerant of the spaces a phone keyboard inserts. */
export const totpCodeSchema = z
  .string({ error: "Invalid TOTP code." })
  .transform((v) => v.replace(/\s+/g, ""))
  .refine((v) => /^\d{6}$/.test(v), "Invalid TOTP code.");

/** POST /api/auth/mfa/backup-codes/regenerate */
export const regenerateBackupCodesBodySchema = z.object({
  totpCode: totpCodeSchema,
});

/** POST /api/auth/mfa/totp/verify */
export const verifyTotpBodySchema = z.object({
  code: totpCodeSchema,
});

/** POST /api/auth/mfa/session — the second-factor step-up. */
export const mfaSessionBodySchema = z.object({
  method: z.enum(["totp", "backup", "webauthn"]).optional(),
  // A TOTP code is 6 digits; a backup code is XXXX-XXXX-XXXX-XXXX.
  code: z.string().max(32).optional(),
  credential: z.unknown().optional(),
});

/** DELETE /api/auth/mfa/webauthn/credentials */
export const webauthnDeleteBodySchema = z.object({
  id: z.string().trim().min(1, "A credential id is required.").max(512),
});

/** POST /api/auth/mfa/webauthn/register/complete */
export const webauthnRegisterBodySchema = z.object({
  credential: z.record(z.string(), z.unknown()),
  credentialName: z.string().trim().max(100).optional(),
});

/** POST /api/auth/password-leak-check — a k-anonymity hash prefix. */
export const passwordLeakCheckBodySchema = z.object({
  prefix: z
    .string({ error: "Invalid prefix." })
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[0-9A-F]{5}$/.test(v), "Invalid prefix."),
});

/** POST /api/user/password — change or first-time set. */
export const passwordChangeBodySchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(1, "A new password is required.").max(128),
});

// ---------------------------------------------------------------------------
// Compliance, storage and data rights
// ---------------------------------------------------------------------------

/** POST /api/compliance/breach with action "record". */
export const breachRecordBodySchema = z.object({
  action: z.literal("record"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().trim().min(1).max(2000),
  affectedCategories: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
  estimatedAffectedUsers: z.number().int().min(0),
  discoveredAt: z.string().trim().min(1).max(40),
  containedAt: z.string().trim().max(40).optional(),
  rootCause: z.string().trim().max(2000).optional(),
  remediationSteps: z.array(z.string().trim().max(500)).max(50).optional(),
  reportedToBoard: z.boolean().optional(),
  reportedToUsers: z.boolean().optional(),
});

/** PATCH /api/compliance/breach — update an existing breach record. */
export const breachUpdateBodySchema = z.object({
  breachId: idSchema,
  containedAt: z.string().trim().max(40).optional(),
  rootCause: z.string().trim().max(2000).optional(),
  remediationSteps: z.array(z.string().trim().max(500)).max(50).optional(),
  reportedToBoard: z.boolean().optional(),
  reportedToUsers: z.boolean().optional(),
  status: z.enum(["open", "contained", "resolved", "closed"]).optional(),
});

/** POST /api/compliance/dashboard — the admin compliance console actions. */
export const complianceDashboardBodySchema = z.object({
  action: z.enum(["generate-ropa", "escalate-rights", "escalate-breach"]),
  requestId: idSchema.optional(),
  breachId: idSchema.optional(),
});

/** POST /api/r2/view — the key of the inspection photo to sign. */
export const r2ViewBodySchema = z.object({
  key: z.string().trim().min(1, "R2 object key is required.").max(1024),
});

/** POST /api/user/age-verification — parental-consent actions. */
export const ageVerificationBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"),
    parentEmail: emailSchema,
    method: z.enum(["otp", "digital_signature", "video_kyc", "aadhaar"]),
  }),
  z.object({
    action: z.literal("verify-otp"),
    consentId: namedIdSchema("Consent ID"),
    otp: z.string().trim().min(1, "OTP required.").max(10),
  }),
  z.object({ action: z.literal("check") }),
]);

/** POST /api/user/consent — grant or withdraw one consent category. */
export const consentBodySchema = z.object({
  category: z.string().trim().min(1, "Category is required.").max(40),
  granted: z.boolean({ error: "Granted must be boolean." }),
  version: z.string().trim().min(1, "Version is required.").max(40),
  method: z.enum(["explicit", "withdrawn"]).optional().default("explicit"),
});

/** POST /api/user/grievance — log a data-rights request or complaint. */
export const grievanceBodySchema = z.object({
  right: z.enum([
    "access",
    "correction",
    "erasure",
    "portability",
    "grievance",
    "nominee",
  ]),
  details: z.string().trim().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Route param schemas
// ---------------------------------------------------------------------------

export const requestIdSchema = z.object({ requestId: idSchema });
export const ticketIdSchema = z.object({ ticketId: idSchema });

// ---------------------------------------------------------------------------
// Utility: validate and coerce a JSON body.
// ---------------------------------------------------------------------------
export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationError {
  success: false;
  errors: Array<{ path?: string; message: string }>;
}

export function validateBody<T extends z.ZodType>(
  body: unknown,
  schema: T
): ValidationResult<z.infer<T>> | ValidationError {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    };
  }
  return { success: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Guarded body reader
// ---------------------------------------------------------------------------

export type ParsedBody<T> =
  | { success: true; data: T }
  | { success: false; reason: "parse" | "schema"; error: string };

/**
 * Reads and validates a JSON request body in one guarded step.
 *
 * A dozen routes read `request.json()` outside a try, so a malformed body
 * became a 500 from the JSON parser instead of a 400 (docs/AUDIT.md §2.7).
 * `reason` separates an unreadable body from one that failed the schema, so
 * a route can keep its specific "enter the 6-digit code" wording for the
 * latter while still answering 400 for both.
 */
export async function readAndValidateBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ParsedBody<z.infer<T>>> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return { success: false, reason: "parse", error: "Invalid JSON body." };
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    return {
      success: false,
      reason: "schema",
      error: "Invalid request body.",
    };
  }

  return { success: true, data: result.data };
}
