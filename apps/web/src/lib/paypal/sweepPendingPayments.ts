/**
 * Settle payments that PayPal captured but this deployment never recorded.
 *
 * The normal path is the browser: `capture-order` captures at PayPal and settles
 * the request. The webhook is the safety net for a lost HTTP response. Both can
 * fail together — the browser closes the tab mid-capture, or PayPal retries a
 * webhook for ~3 days and gives up — and then the customer has been charged while
 * `paypalPaymentOrders` still says `created` and the request still says
 * `awaiting_payment`. Nothing in the app retries that, so it waits for a human.
 *
 * The reconciliation job cannot see it either: it compares orders marked
 * `completed` against requests, and this order never reached `completed`.
 *
 * This sweep asks PayPal what actually happened and settles what it finds. It is
 * deliberately narrow:
 *
 *   - only orders older than a grace period, so it cannot race the browser that
 *     is still finishing its own capture;
 *   - only orders PayPal reports as COMPLETED, because that is the one state
 *     where inaction takes money without delivering anything;
 *   - settlement itself is idempotent per order (`settleMainPayment` re-reads the
 *     order inside its transaction and treats `completed` as a no-op), so a
 *     sweep that overlaps a live capture cannot double-charge.
 *
 * A VOIDED order is marked `voided` so it stops being polled. Anything else —
 * CREATED, APPROVED, PAYER_ACTION_REQUIRED — is left exactly as it is: the
 * customer may still be paying, and guessing there would be worse than waiting.
 */

import type { DocumentData, DocumentReference } from "firebase-admin/firestore";

export interface StuckPaymentOrder {
  id: string;
  ref: DocumentReference;
  data: DocumentData;
}

export interface CompletedCapture {
  captureId: string;
  amount: number;
  currency: string;
}

export interface SweepDeps {
  /** Orders in `created` state inside the age window. */
  listStuckOrders: () => Promise<StuckPaymentOrder[]>;
  /** Ask PayPal for the authoritative order payload. */
  fetchOrder: (orderId: string) => Promise<unknown>;
  /** Settle a main-quote payment, idempotently. */
  settleMain: (input: {
    paymentOrder: StuckPaymentOrder;
    capture: CompletedCapture;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Settle an additional-item payment, idempotently. */
  settleAdditionalItem: (input: {
    paymentOrder: StuckPaymentOrder;
    capture: CompletedCapture;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Record that the order is voided at PayPal, so it is not polled again. */
  markVoided: (order: StuckPaymentOrder) => Promise<void>;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface SweepResult {
  scanned: number;
  settled: number;
  voided: number;
  /** Still in progress at PayPal: left alone on purpose. */
  pending: number;
  failures: Array<{ orderId: string; error: string }>;
}

/**
 * Read the capture PayPal made for a completed order.
 *
 * A completed order carries its captures under
 * `purchase_units[].payments.captures[]`; the first COMPLETED one is the charge.
 * Returns null for anything else, so a caller can treat "no capture" as "not
 * paid" rather than inventing an amount.
 */
export function readCompletedCapture(payload: unknown): CompletedCapture | null {
  if (!payload || typeof payload !== "object") return null;

  const units = (payload as { purchase_units?: unknown }).purchase_units;
  if (!Array.isArray(units)) return null;

  for (const unit of units) {
    const captures = (unit as { payments?: { captures?: unknown } })?.payments
      ?.captures;
    if (!Array.isArray(captures)) continue;

    for (const capture of captures) {
      const record = capture as {
        id?: unknown;
        status?: unknown;
        amount?: { value?: unknown; currency_code?: unknown };
      };

      if (record?.status !== "COMPLETED") continue;
      if (typeof record.id !== "string" || !record.id) continue;

      const value = Number(record.amount?.value);
      if (!Number.isFinite(value) || value <= 0) continue;

      return {
        captureId: record.id,
        amount: value,
        currency:
          typeof record.amount?.currency_code === "string"
            ? record.amount.currency_code
            : "USD",
      };
    }
  }

  return null;
}

/** PayPal's own order state, upper-cased, or "" when absent. */
export function readOrderState(payload: unknown): string {
  const status = (payload as { status?: unknown })?.status;
  return typeof status === "string" ? status.toUpperCase() : "";
}

export async function sweepPendingPayments(
  deps: SweepDeps
): Promise<SweepResult> {
  const result: SweepResult = {
    scanned: 0,
    settled: 0,
    voided: 0,
    pending: 0,
    failures: [],
  };

  const orders = await deps.listStuckOrders();
  result.scanned = orders.length;

  for (const order of orders) {
    const orderId = order.id;

    try {
      const payload = await deps.fetchOrder(orderId);
      const state = readOrderState(payload);

      if (state === "VOIDED") {
        await deps.markVoided(order);
        result.voided += 1;
        continue;
      }

      if (state !== "COMPLETED") {
        // Still payable, or PayPal has not finished: nothing to do yet.
        result.pending += 1;
        continue;
      }

      const capture = readCompletedCapture(payload);

      if (!capture) {
        // COMPLETED with no capture is a shape this code does not understand.
        // Reporting it is the point: settling on a guessed amount would be worse.
        result.failures.push({
          orderId,
          error: "PayPal reports COMPLETED but no completed capture was found.",
        });
        continue;
      }

      const settlement =
        order.data.paymentType === "additional_item"
          ? await deps.settleAdditionalItem({ paymentOrder: order, capture })
          : await deps.settleMain({ paymentOrder: order, capture });

      if (!settlement.ok) {
        result.failures.push({
          orderId,
          error: settlement.error ?? "Settlement failed.",
        });
        continue;
      }

      result.settled += 1;
      deps.log?.("Settled a payment PayPal had already captured", {
        orderId,
        captureId: capture.captureId,
      });
    } catch (error) {
      result.failures.push({
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
