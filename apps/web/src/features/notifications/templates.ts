/**
 * WhatsApp template names.
 *
 * Meta rejects a send whose template name does not exist, and a typo only shows
 * up as a failed notification at runtime. Keeping the names here makes the set
 * reviewable in one place instead of four string literals.
 */
export const WHATSAPP_TEMPLATES = {
  packageShipped: "shipin_package_shipped",
  paymentReceived: "shipin_payment_received",
  supportUpdate: "shipin_support_update",
} as const;

export type WhatsAppTemplateName =
  (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES];
