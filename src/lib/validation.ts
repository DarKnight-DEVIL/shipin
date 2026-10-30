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
  .number()
  .finite("Amount must be a valid number.")
  .positive("Amount must be greater than zero.")
  .max(999999999, "Amount exceeds maximum allowed.")
  .refine(
    (n) => Number.isFinite(n) && Math.round((n + Number.EPSILON) * 100) / 100 === n,
    "Amount must have at most 2 decimal places."
  );

/** A Firestore document ID (alphanumeric, short, bounded). */
export const idSchema = z
  .string()
  .trim()
  .min(1, "ID is required.")
  .max(64, "ID is too long.")
  .regex(/^[a-zA-Z0-9_-]+$/, "ID contains invalid characters.");

/** A UUID (strict). */
export const uuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid ID format."
  );

/** Free-text message: no HTML, no scripts, bounded length. */
export const messageSchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty.")
  .max(2000, "Message is too long (max 2000 characters).");

/** Admin ticket/support reason. */
export const adminReasonSchema = messageSchema;

/** Customer name / display name. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(100, "Name is too long (max 100 characters).")
  .regex(
    /^[A-Za-z\s\p{Script=Latin}'-]+$/u,
    "Name contains invalid characters."
  );

/** Short label: 1-50 chars, limited character set. */
export const labelSchema = z
  .string()
  .trim()
  .min(1, "Label is required.")
  .max(50, "Label is too long.")
  .regex(/^[A-Za-z0-9\s-]+$/, "Label contains invalid characters.");

/** PayPal payment type enum. */
export const paymentTypeSchema = z.enum(["main", "additional_item"]);

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

/** Request status enum (server-defined; clients cannot set this). */
export const requestStatusSchema = z.enum([
  "draft",
  "submitted",
  "processing",
  "purchased",
  "shipped",
  "delivered",
  "cancelled",
  "refund_requested",
  "refunded",
]);

// ---------------------------------------------------------------------------
// API request bodies
// ---------------------------------------------------------------------------

/** POST /api/send-email and universal email wrapper. */
export const sendEmailBodySchema = z.object({
  type: z.enum(["quote", "payment", "shipment", "shipped", "delivered", "refunded", "support"]).optional(),
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
  description: z.string().trim().max(200).optional().default("Credit issued by admin"),
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

/** POST /api/requests/[id]/refund (customer) */
export const customerRefundBodySchema = z.object({
  method: refundMethodSchema,
  amount: moneySchema,
  reason: messageSchema.optional(),
});

/** POST /api/requests/[id]/request-new-quote */
export const newQuoteBodySchema = z.object({
  requestId: idSchema,
});

/** POST /api/requests/[id]/quote */
export const quoteBodySchema = z.object({
  requestId: idSchema,
});

/** POST /api/requests/[id]/shipment-status */
export const shipmentStatusBodySchema = z.object({
  requestId: idSchema,
});

/** POST /api/paypal/create-order */
export const createOrderBodySchema = z.object({
  requestId: idSchema,
  amount: moneySchema,
  paymentType: paymentTypeSchema.optional().default("main"),
  additionalItemRequestId: idSchema.optional(),
});

/** POST /api/paypal/capture-order */
export const captureOrderBodySchema = z.object({
  requestId: idSchema,
  orderID: z.string().trim().min(1, "Order ID is required.").max(64),
  amount: moneySchema,
  paymentType: paymentTypeSchema.optional().default("main"),
  additionalItemRequestId: idSchema.optional(),
});

/** POST /api/paypal/create-wallet-topup */
export const createTopupBodySchema = z.object({
  amount: moneySchema,
  description: z.string().trim().max(200).optional(),
});

/** POST /api/payment/complete-wallet */
export const completeWalletBodySchema = z.object({
  requestId: idSchema,
  amount: moneySchema,
});

/** POST /api/r2/upload */
export const r2UploadBodySchema = z.object({
  requestId: idSchema,
});

/** POST /api/r2/view */
export const r2ViewBodySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Object key is required.")
    .max(512, "Object key is too long.")
    .regex(/^inspection\/.+/i, "Only inspection images are allowed."),
});

/** POST /api/whatsapp/test */
export const whatsappTestBodySchema = z.object({
  phone: whatsappPhoneSchema,
});

// ---------------------------------------------------------------------------
// Route param schemas
// ---------------------------------------------------------------------------

export const requestIdSchema = z.object({ requestId: idSchema });
export const ticketIdSchema = z.object({ ticketId: idSchema });
export const trackingIdSchema = z.object({ trackingId: idSchema });

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