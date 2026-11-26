/**
 * Main-request payment state.
 *
 * A quote can only be settled while the request is still in a payable state.
 * Keeping the decision here means checkout, capture, settlement and the
 * wallet-only path cannot drift into different answers.
 *
 * `pending` is included for older rows written before the explicit workflow
 * statuses; everything that has already moved into payment, refund, rejection
 * or fulfilment is refused.
 */

const PAYABLE_MAIN_STATUSES = new Set([
  "submitted",
  "review",
  "awaiting_payment",
  "pending",
]);

const ALREADY_PAID_STATUSES = new Set(["paid"]);
const TERMINAL_NON_PAYABLE_STATUSES = new Set([
  "refunded",
  "rejected",
  "refund_requested",
  "refund_offered",
  "purchased",
  "warehouse_received",
  "ready_for_international_shipping",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
]);

/** Why a main payment cannot start/settle, or null when it can. */
export function mainPaymentStatusError(status: unknown): string | null {
  if (typeof status === "string" && PAYABLE_MAIN_STATUSES.has(status)) {
    return null;
  }

  if (typeof status === "string" && ALREADY_PAID_STATUSES.has(status)) {
    return "This request has already been paid.";
  }

  if (typeof status === "string" && TERMINAL_NON_PAYABLE_STATUSES.has(status)) {
    return "This request is no longer awaiting payment.";
  }

  return "This request is not awaiting payment.";
}
