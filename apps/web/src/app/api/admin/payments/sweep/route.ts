/**
 * `POST /api/cron/paypal-sweep` — settle payments PayPal captured but we did not.
 *
 * Why this exists: money reaches a request by two independent paths, the
 * browser's capture and the PayPal webhook. Both can fail for the same order —
 * the tab closes mid-capture and PayPal's webhook retries stop after ~3 days —
 * and then the customer has been charged while the order sits at `created` and
 * the request sits at `awaiting_payment`, with nothing in the app to notice.
 *
 * The reconciliation job cannot cover this: it compares orders marked
 * `completed` against requests, and this order never reached `completed`.
 *
 * This sweep asks PayPal for the truth about orders in that state and settles
 * the ones it already captured. `settleMainPayment` re-reads the order inside
 * its transaction, so running while a browser capture is still finishing is
 * safe: whoever writes second finds the order `completed` and does nothing.
 *
 * A thin route on purpose — the decisions live in
 * `lib/paypal/sweepPendingPayments.ts`, which is tested without PayPal.
 */

import { NextRequest, NextResponse } from "next/server";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyCronRequest } from "@/lib/cronAuth";
import { verifyPayPalOrder } from "@/lib/paypal";
import { settleMainPayment } from "@/lib/paypal/settleMainPayment";
import { settleAdditionalItemPayment } from "@/lib/paypal/settleAdditionalItemPayment";
import type { StuckPaymentOrder } from "@/lib/paypal/sweepPendingPayments";
import { sweepPendingPayments } from "@/lib/paypal/sweepPendingPayments";
import { withErrorHandler } from "@/utils/errors";
import { sendNotification } from "@/features/notifications/services/notificationService";
import { buildPaymentReceivedNotification } from "@/lib/paypal/paymentReceivedNotification";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * How long an order must sit in `created` before the sweep will touch it.
 *
 * The browser's own capture takes seconds. Fifteen minutes is comfortably past
 * it, so a live checkout is never raced, and it is far inside PayPal's ~3-day
 * webhook retry window, so a genuine failure is caught long before PayPal gives
 * up.
 */
const MIN_AGE_MS = 15 * 60 * 1000;

/**
 * How far back the sweep looks.
 *
 * PayPal stops retrying webhooks after about three days and its order records
 * remain readable well beyond that, so a fortnight covers the entire failure
 * window with room for a missed run.
 */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Bounded so one run cannot walk an unbounded collection. */
const SWEEP_LIMIT = 100;

interface OrderDocument extends DocumentData {
  orderId?: string;
  paymentType?: string;
  status?: string;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  // Fail closed with a config error rather than 401: a missing secret makes
  // every call look unauthorised, which hides a deployment that cannot run this
  // job at all behind what reads like a bad signature.
  // Read straight from process.env, like the other cron routes: the env module
  // is replaced by a static object under test, which would make this silently
  // unusable there.
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[paypal-sweep] CRON_SECRET is not configured; the sweep refused to run.");
    return NextResponse.json(
      { success: false, error: "Cron not configured.", code: "CONFIG_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }

  if (!(await verifyCronRequest(request, cronSecret))) {
    return NextResponse.json(
      { success: false, error: "Unauthorized.", code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE }
    );
  }

  const now = Date.now();

  const listStuckOrders = async (): Promise<StuckPaymentOrder[]> => {
    const snapshot = await adminDb
      .collection("paypalPaymentOrders")
      .where("status", "==", "created")
      .where("createdAt", "<=", new Date(now - MIN_AGE_MS))
      .where("createdAt", ">=", new Date(now - MAX_AGE_MS))
      .limit(SWEEP_LIMIT)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ref: doc.ref as DocumentReference,
      data: doc.data() as OrderDocument,
    }));
  };

  const result = await sweepPendingPayments({
    listStuckOrders,
    fetchOrder: (orderId) => verifyPayPalOrder(orderId),

    settleMain: async ({ paymentOrder, capture }) => {
      const requestId = String(paymentOrder.data.requestId ?? "");
      if (!requestId) return { ok: false, error: "Order has no requestId." };

      const settlement = await settleMainPayment({
        requestRef: adminDb.collection("requests").doc(requestId),
        paymentOrderRef: paymentOrder.ref,
        paymentOrder: paymentOrder.data,
        requestId,
        orderID: String(paymentOrder.data.orderId ?? paymentOrder.id),
        captureId: capture.captureId,
        capturedAmount: capture.amount,
        capturedCurrency: capture.currency,
        expectedPayPalAmount: Number(paymentOrder.data.paypalAmount ?? 0),
      });

      if (!settlement.ok) {
        return { ok: false, error: settlement.error ?? "Settlement failed." };
      }

      // The browser path emails a receipt when it settles. A payment this sweep
      // repaired is the same event from the customer's side - they were charged
      // and heard nothing - so the receipt goes out here too. A failed
      // notification must not undo a settled payment.
      try {
        const requestData = (await adminDb.collection("requests").doc(requestId).get()).data();

        await sendNotification(
          buildPaymentReceivedNotification({
            userId: String(requestData?.userId ?? ""),
            requestId,
            customerName:
              requestData?.customerName ||
              requestData?.shippingAddress?.firstName ||
              "Customer",
          })
        );
      } catch (error) {
        console.warn("[paypal-sweep] Payment receipt notification failed", { requestId, error });
      }

      return { ok: true };
    },

    settleAdditionalItem: async ({ paymentOrder, capture }) => {
      const requestId = String(paymentOrder.data.requestId ?? "");
      const additionalItemRequestId = String(
        paymentOrder.data.additionalItemRequestId ?? ""
      );
      if (!requestId || !additionalItemRequestId) {
        return { ok: false, error: "Order is missing its request references." };
      }

      const requestSnapshot = await adminDb.collection("requests").doc(requestId).get();
      const requestData = requestSnapshot.data();
      if (!requestData) return { ok: false, error: "Request no longer exists." };

      const settlement = await settleAdditionalItemPayment({
        requestRef: adminDb.collection("requests").doc(requestId),
        paymentOrderRef: paymentOrder.ref,
        requestData,
        paymentOrder: paymentOrder.data,
        additionalItemRequestId,
        orderID: String(paymentOrder.data.orderId ?? paymentOrder.id),
        captureId: capture.captureId,
        capturedAmount: capture.amount,
        capturedCurrency: capture.currency,
      });

      return settlement.ok
        ? { ok: true }
        : { ok: false, error: settlement.error ?? "Settlement failed." };
    },

    markVoided: async (paymentOrder) => {
      await paymentOrder.ref.set(
        { status: "voided", voidedAt: new Date(), voidedBy: "paypal-sweep" },
        { merge: true }
      );
    },

    log: (message, detail) => {
      // warn, not info: the lint config allows error/warn only, and a settlement
      // the sweep performed is worth seeing in the deployment logs.
      console.warn(`[paypal-sweep] ${message}`, detail ?? {});
    },
  });

  // Failures are a 500 on purpose: a settlement that could not complete is a
  // charged customer, and the workflow must go red rather than report a green
  // run carrying a detail nobody opens.
  return NextResponse.json(
    { success: result.failures.length === 0, ...result },
    { status: result.failures.length === 0 ? 200 : 500, headers: NO_STORE }
  );
});
