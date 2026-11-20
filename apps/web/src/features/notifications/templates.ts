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

const TEMPLATE_NAMES: ReadonlySet<string> = new Set(
  Object.values(WHATSAPP_TEMPLATES)
);

/**
 * Whether a template name is one we registered (and had approved in Meta
 * Business Manager). Meta rejects unknown names, so sending one wastes an API
 * call and only shows up as a notification that never arrives.
 */
export function isKnownWhatsAppTemplate(name: string): boolean {
  return TEMPLATE_NAMES.has(name);
}
