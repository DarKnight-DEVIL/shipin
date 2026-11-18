import { EmailSchema, PhoneSchema, MoneySchema } from "./types";

export const validateEmail = (email: string): boolean =>
  EmailSchema.safeParse(email).success;
export const validatePhone = (phone: string): boolean =>
  PhoneSchema.safeParse(phone).success;
export const validateMoney = (amount: number): boolean =>
  MoneySchema.safeParse(amount).success;

export const formatMoney = (amount: number, currency = "USD"): string => {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount
  );
};

/**
 * Escape text that is about to be placed in an HTML document.
 *
 * Use it on untrusted *text*, not on HTML you want to keep: it encodes the five
 * characters that break out of text or an attribute, so the result can be
 * interpolated into markup without opening an injection. `&` must go first, or
 * the entities this emits would be escaped again.
 *
 * It is not a sanitiser: it does not parse HTML, so `<b>` becomes visible
 * `&lt;b&gt;` rather than a tag. Callers that need markup preserved need a real
 * parser-based sanitiser and an allowlist.
 */
export const sanitizeHtml = (html: string): string => {
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};
