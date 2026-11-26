import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { childLogger } from "@/lib/logger";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { serverEnv } from "@/config/env";
import {
  apiRateLimiter,
  addRateLimitHeaders,
  isRateLimited,
} from "@/lib/rateLimiter";
import { verifyPayPalWebhook } from "@/lib/paypal";
import { captureServerError } from "@/lib/errorTracking";
import { sendNotification } from "@/features/notifications/services/notificationService";
import { buildPaymentReceivedNotification } from "@/lib/paypal/paymentReceivedNotification";
import { roundMoney, toNumber } from "@/lib/paypal/amounts";
import {
  minorFromStored,
  storedMinor,
  subtractMinor,
  toDecimal,
} from "@/lib/money";
import { balanceFields, ledgerFields, reservedFields } from "@/lib/moneyMode";
import {
  deleteConsumedWalletHold,
  reservedAfterReleaseMinor,
  WALLET_HOLDS_COLLECTION,
} from "@/lib/paypal/walletHolds";

// PayPal Webhook ID from the developer dashboard.
// Should be set in environment variables: PAYPAL_WEBHOOK_ID
const PAYPAL_WEBHOOK_ID = serverEnv.PAYPAL_WEBHOOK_ID;

const webhookLogger = childLogger({ service: "paypal-webhook" });

/**
 * Headers PayPal signs every delivery with.
 *
 * A body without them cannot pass `verifyPayPalWebhook`, which forwards these
 * values straight to PayPal's verify endpoint. Checking their presence costs
 * nothing locally and keeps an unauthenticated flood from buying an OAuth
 * token plus a verification call per request.
 */
const PAYPAL_SIGNATURE_HEADERS = [
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
  "paypal-cert-url",
  "paypal-auth-algo",
] as const;

/**
 * POST /api/webhook
 *
 * Receives PayPal webhook events and processes them.
 * Verifies the webhook signature to ensure authenticity.
 *
 * This endpoint MUST be excluded from proxy auth checks
 * so the raw body is available for signature verification.
 * (See proxy.ts matcher config.)
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // The proxy matcher excludes this path so signature verification sees the
  // raw body — which also means the global API limiter never sees it. Meter
  // it here, before any external call: an unauthenticated flood would
  // otherwise spend a PayPal OAuth token and a verify-webhook-signature call
  // on every request. Fail open on `unavailable` so a limiter outage cannot
  // drop payment confirmations, exactly like the proxy does.
  const limit = await apiRateLimiter.record(request);

  if (isRateLimited(limit) && !limit.unavailable) {
    const response = NextResponse.json(
      {
        success: false,
        error: "Too many requests, please try again later.",
        code: "RATE_LIMIT_ERROR",
      },
      { status: 429 }
    );
    addRateLimitHeaders(response.headers, limit);
    return response;
  }

  if (!PAYPAL_WEBHOOK_ID) {
    console.error("PAYPAL_WEBHOOK_ID is not configured");
    return NextResponse.json(
      {
        success: false,
        error: "Webhook not configured.",
        code: "CONFIGURATION_ERROR",
      },
      { status: 500 }
    );
  }

  // Cheap gate first: without PayPal's signature headers the verification
  // call below cannot succeed, so reject the request before spending it.
  const missingSignatureHeader = PAYPAL_SIGNATURE_HEADERS.find(
    (name) => !request.headers.get(name)
  );

  if (missingSignatureHeader) {
    webhookLogger.warn("PayPal webhook missing signature header", {
      header: missingSignatureHeader,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Invalid webhook signature.",
        code: "INVALID_SIGNATURE",
      },
      { status: 400 }
    );
  }

  // Get raw body for signature verification
  const rawBody = await request.text();

  // Verify the webhook signature (using request.headers directly as Headers object)
  const valid = await verifyPayPalWebhook(
    request.headers,
    rawBody,
    PAYPAL_WEBHOOK_ID
  );

  if (!valid) {
    webhookLogger.warn("PayPal webhook signature verification failed");
    return NextResponse.json(
      {
        success: false,
        error: "Invalid webhook signature.",
        code: "INVALID_SIGNATURE",
      },
      { status: 400 }
    );
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  /*
   * An event id is what makes duplicate deliveries safe, so an event without a usable
   * one is refused rather than processed. PayPal always sends `id`; a signed payload
   * that lacks it means something between PayPal and here altered the body, and
   * processing it would write money state with no way to recognise the retry.
   *
   * The capture handler is idempotent in its own right (it no-ops on a completed order
   * inside a transaction), so this is defence in depth - but "the handler happens to be
   * safe twice" is a property of one event type, not of the endpoint.
   */
  const rawEventId = event.id;

  if (typeof rawEventId !== "string" || rawEventId.trim() === "") {
    webhookLogger.error("PayPal webhook arrived without an event id", {
      eventType: event.event_type,
    });
    void captureServerError(
      new Error("Signed PayPal webhook without an event id."),
      {
        category: "payment-settlement",
        severity: "critical",
        code: "PAYPAL_WEBHOOK_MISSING_EVENT_ID",
        context: { eventType: String(event.event_type ?? "unknown") },
      }
    );

    return NextResponse.json(
      {
        success: false,
        error: "Webhook event id is required.",
        code: "MISSING_EVENT_ID",
      },
      { status: 400 }
    );
  }

  const eventId = rawEventId.trim();

  // Firestore document ids cannot contain a slash, and an id that long is not PayPal's.
  if (eventId.includes("/") || eventId.length > 400) {
    webhookLogger.error("PayPal webhook event id is not a usable document id", {
      eventType: event.event_type,
    });

    return NextResponse.json(
      {
        success: false,
        error: "Webhook event id is not valid.",
        code: "INVALID_EVENT_ID",
      },
      { status: 400 }
    );
  }

  // PayPal retries a delivery it could not confirm, so the same event id can
  // arrive twice. The marker is written only after the handler succeeds: a
  // failed attempt still returns 500 and is retried.
  const eventRef = adminDb.collection("paypalWebhookEvents").doc(eventId);

  const seen = await eventRef.get();
  if (seen.exists) {
    return NextResponse.json({
      received: true,
      success: true,
      duplicate: true,
    });
  }

  // Process the event
  try {
    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        await handleCaptureCompleted(event.resource as Record<string, unknown>);
        break;

      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.REFUNDED":
      case "PAYMENT.CAPTURE.PENDING":
        // Log but don't auto-process these
        break;

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
        // Not applicable to our one-time payments
        break;

      default:
      // Unhandled event types are acknowledged but not processed
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Return 500 so PayPal will retry the webhook delivery.
    // handleCaptureCompleted is idempotent (checks captureId + request status),
    // so retries are safe.
    return NextResponse.json(
      {
        success: false,
        error: "Webhook processing failed.",
        code: "WEBHOOK_PROCESSING_ERROR",
      },
      { status: 500 }
    );
  }

  await eventRef.set({
    eventType: event.event_type ?? "unknown",
    processedAt: FieldValue.serverTimestamp(),
  });

  // PayPal requires a 2xx to stop delivery; `received` is the provider contract.
  return NextResponse.json({ received: true, success: true });
});

interface PayPalCapture {
  id?: string;
  amount?: { value?: string; currency_code?: string };
  supplementary_data?: { related_ids?: { order_id?: string } };
  links?: Array<{ rel?: string; href?: string }>;
}

/**
 * Handle a completed PayPal capture from a webhook.
 * This provides server-side confirmation independent of the client.
 *
 * Every document the decision depends on — request, payment order, wallet,
 * wallet hold and the ledger entry — is read before the first write. The
 * previous version updated the request and the payment order and only then read
 * the wallet, which Firestore rejects inside a transaction, so a webhook that
 * arrived after the client capture could fail every retry.
 */
async function handleCaptureCompleted(capture: PayPalCapture) {
  const captureId = capture.id;
  const orderId =
    capture.supplementary_data?.related_ids?.order_id ||
    capture.links
      ?.find((l) => l.rel === "order")
      ?.href?.split("/")
      .pop() ||
    "";

  if (!orderId) {
    console.error("Capture completed but no order ID found:", captureId);
    return;
  }

  // Look up our stored payment order
  const paymentOrderRef = adminDb
    .collection("paypalPaymentOrders")
    .doc(orderId);

  const paymentOrderSnapshot = await paymentOrderRef.get();

  if (!paymentOrderSnapshot.exists) {
    webhookLogger.warn("PayPal order not found in our records", { orderId });
    return;
  }

  const paymentOrder = paymentOrderSnapshot.data();
  if (!paymentOrder) return;

  // Check if already processed (idempotency)
  if (paymentOrder.status === "completed") {
    return;
  }

  const capturedAmount = roundMoney(toNumber(capture.amount?.value));
  const expectedAmount = roundMoney(toNumber(paymentOrder.paypalAmount));

  if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
    console.error("PayPal capture amount mismatch:", {
      captureId,
      orderId,
      expected: expectedAmount,
      actual: capturedAmount,
    });
    // Throw so PayPal retries the webhook; marking it processed would lose the drift.
    throw new Error(
      `PayPal capture amount mismatch: expected ${expectedAmount}, got ${capturedAmount}`
    );
  }

  const requestId = paymentOrder.requestId as string;
  const userId = paymentOrder.userId as string;
  const requestRef = adminDb.collection("requests").doc(requestId);
  const walletRef = adminDb.collection("wallets").doc(userId);
  const holdRef =
    typeof paymentOrder.walletHoldId === "string" && paymentOrder.walletHoldId
      ? adminDb
          .collection(WALLET_HOLDS_COLLECTION)
          .doc(paymentOrder.walletHoldId)
      : null;

  /*
   * One ledger document per capture, derived from PayPal's capture id, so a
   * redelivered COMPLETED event cannot write the wallet deduction twice.
   */
  const walletTransactionRef = adminDb
    .collection("walletTransactions")
    .doc(`paypal_${captureId}`);

  const walletApplied = roundMoney(toNumber(paymentOrder.walletApplied));
  const totalRequired = roundMoney(
    toNumber(paymentOrder.totalRequired) || capturedAmount + walletApplied
  );
  const baseAmount = roundMoney(toNumber(paymentOrder.baseAmount));
  const capturedCurrency = capture.amount?.currency_code || "USD";
  const paymentMethod = walletApplied > 0 ? "wallet_and_paypal" : "paypal";

  const customerName = await adminDb.runTransaction(async (transaction) => {
    // ---- Reads first ----
    const requestSnapshot = await transaction.get(requestRef);
    const currentOrderSnapshot = await transaction.get(paymentOrderRef);
    const walletSnapshot = await transaction.get(walletRef);
    const holdSnapshot = holdRef ? await transaction.get(holdRef) : null;
    const ledgerSnapshot = await transaction.get(walletTransactionRef);

    const currentOrder = currentOrderSnapshot.data();
    if (!currentOrder) {
      throw new Error("Payment order disappeared during settlement.");
    }

    // A concurrent attempt finished first; this delivery is a no-op.
    if (currentOrder.status === "completed") return;

    if (!requestSnapshot.exists) {
      console.error("Request not found:", requestId);
      return;
    }

    const requestData = requestSnapshot.data();
    if (!requestData) return;

    /*
     * The request was settled by another path. Finish the payment-order mark
     * so this delivery stops retrying, but do not move money a second time.
     */
    if (requestData.status === "paid") {
      transaction.update(paymentOrderRef, {
        status: "completed",
        captureId,
        capturedAmount,
        capturedCurrency,
        completedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    /*
     * The balance is read through `storedMinor` (ADR-0008, phase 2) so this
     * path understands both the decimal field a legacy wallet holds and the
     * integer one a migrated wallet will hold. The debit itself happens in
     * minor units; only the write below converts back.
     */
    let newBalanceMinor = storedMinor(walletSnapshot.data(), "balance");
    const walletAppliedMinor = minorFromStored(walletApplied);

    if (walletApplied > 0 && !ledgerSnapshot.exists) {
      if (!walletSnapshot.exists) {
        // Wallet document missing but payment order says wallet was used.
        // Throw to trigger a retry rather than silently skipping the debit.
        throw new Error(
          `Wallet document missing for user ${userId} but walletApplied=${walletApplied}`
        );
      }

      if (newBalanceMinor + 1 < walletAppliedMinor) {
        // The hold should make this impossible; if it happens the balance must
        // not go negative and the capture needs a human, not a retry loop.
        throw new Error(
          `Wallet balance ${toDecimal(newBalanceMinor)} cannot cover walletApplied=${walletApplied} for ${orderId}`
        );
      }
    }

    // ---- Writes ----
    if (walletApplied > 0 && !ledgerSnapshot.exists) {
      newBalanceMinor = subtractMinor(newBalanceMinor, walletAppliedMinor);

      transaction.set(
        walletRef,
        {
          ...balanceFields(newBalanceMinor),
          ...reservedFields(
            reservedAfterReleaseMinor(walletSnapshot, holdSnapshot)
          ),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(walletTransactionRef, {
        userId,
        type: "payment",
        ...ledgerFields(-walletAppliedMinor, newBalanceMinor),
        requestId,
        description: "Request Payment",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    transaction.update(requestRef, {
      status: "paid",
      payment: {
        provider: paymentMethod,
        paymentMethod,
        orderId,
        captureId,
        amount: totalRequired,
        amountPaid: totalRequired,
        paypalAmount: capturedAmount,
        walletAmount: walletApplied,
        quoteAmount: baseAmount,
        currency: capturedCurrency,
        status: "completed",
        paidAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(paymentOrderRef, {
      status: "completed",
      captureId,
      capturedAmount,
      capturedCurrency,
      completedAt: FieldValue.serverTimestamp(),
    });

    deleteConsumedWalletHold(transaction, holdRef, holdSnapshot);

    // The payment order never stores a name; the request does.
    return (
      (requestData.customerName as string | undefined) ||
      requestData.shippingAddress?.firstName ||
      "Customer"
    );
  });

  // Send notification (outside transaction)
  try {
    await sendNotification(
      buildPaymentReceivedNotification({
        userId,
        requestId,
        customerName: customerName || "Customer",
      })
    );
  } catch (error) {
    console.error("Webhook notification failed:", error);
  }
}
