import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { serverEnv } from "@/config/env";
import {
  apiRateLimiter,
  addRateLimitHeaders,
  isRateLimited,
} from "@/lib/rateLimiter";
import { verifyPayPalWebhook } from "@/lib/paypal";
import { sendNotification } from "@/features/notifications/services/notificationService";
import { WHATSAPP_TEMPLATES } from "@/features/notifications/templates";

// PayPal Webhook ID from the developer dashboard.
// Should be set in environment variables: PAYPAL_WEBHOOK_ID
const PAYPAL_WEBHOOK_ID = serverEnv.PAYPAL_WEBHOOK_ID;

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
    console.warn(
      "PayPal webhook missing signature header:",
      missingSignatureHeader
    );
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
    console.warn("PayPal webhook signature verification failed");
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

  // PayPal retries a delivery it could not confirm, so the same event id can
  // arrive twice. The marker is written only after the handler succeeds: a
  // failed attempt still returns 500 and is retried.
  const eventId = typeof event.id === "string" ? event.id : "";
  const eventRef = eventId
    ? adminDb.collection("paypalWebhookEvents").doc(eventId)
    : null;

  if (eventRef) {
    const seen = await eventRef.get();
    if (seen.exists) {
      return NextResponse.json({
        received: true,
        success: true,
        duplicate: true,
      });
    }
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

  if (eventRef) {
    await eventRef.set({
      eventType: event.event_type ?? "unknown",
      processedAt: FieldValue.serverTimestamp(),
    });
  }

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
    console.warn("PayPal order not found in our records:", orderId);
    return;
  }

  const paymentOrder = paymentOrderSnapshot.data();
  if (!paymentOrder) return;

  // Check if already processed (idempotency)
  if (paymentOrder.status === "completed") {
    return;
  }

  const capturedAmount = Number(capture.amount?.value ?? 0);
  const expectedAmount = Number(paymentOrder.paypalAmount ?? 0);

  if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
    console.error("PayPal capture amount mismatch:", {
      captureId,
      orderId,
      expected: expectedAmount,
      actual: capturedAmount,
    });
    return;
  }

  const requestId = paymentOrder.requestId;
  const requestRef = adminDb.collection("requests").doc(requestId);

  // Run transaction to atomically update request + wallet + notifications
  await adminDb.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) {
      console.error("Request not found:", requestId);
      return;
    }

    const requestData = requestSnapshot.data();
    if (!requestData) return;

    // Check if already paid (idempotency)
    if (requestData.status === "paid") {
      return;
    }

    // Mark request as paid
    transaction.update(requestRef, {
      status: "paid",
      payment: {
        provider: "paypal",
        paymentMethod: "paypal",
        orderId,
        captureId,
        amountPaid: capturedAmount,
        walletAmount: paymentOrder.walletApplied ?? 0,
        paypalAmount: capturedAmount,
        status: "completed",
        paidAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update payment order
    transaction.update(paymentOrderRef, {
      status: "completed",
      captureId,
      capturedAmount,
      capturedCurrency: capture.amount?.currency_code,
      completedAt: FieldValue.serverTimestamp(),
    });

    // Create wallet transaction if wallet was used
    const walletApplied = paymentOrder.walletApplied ?? 0;
    if (walletApplied > 0) {
      const walletRef = adminDb.collection("wallets").doc(requestData.userId);
      const walletSnapshot = await transaction.get(walletRef);
      if (walletSnapshot.exists) {
        const currentBalance = walletSnapshot.data()?.balance ?? 0;
        const newBalance = currentBalance - walletApplied;
        transaction.update(walletRef, {
          balance: newBalance,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const walletTransactionRef = adminDb
          .collection("walletTransactions")
          .doc();
        transaction.set(walletTransactionRef, {
          userId: requestData.userId,
          type: "payment",
          amount: -walletApplied,
          balanceAfter: newBalance,
          requestId,
          description: "Request Payment",
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
  });

  // Send notification (outside transaction)
  try {
    const userId = paymentOrder.userId;
    const customerName = paymentOrder.customerName || requestId;
    await sendNotification({
      userId,
      requestId,
      title: "Payment Received",
      message: "We've received your payment successfully.",
      type: "payment",
      category: "payment",
      channels: { inApp: true, email: true, whatsapp: true },
      whatsapp: {
        templateName: WHATSAPP_TEMPLATES.paymentReceived,
        languageCode: "en",
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: customerName },
              { type: "text", text: requestId },
            ],
          },
        ],
      },
    });
  } catch (error) {
    console.error("Webhook notification failed:", error);
  }
}
