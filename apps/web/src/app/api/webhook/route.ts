import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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
import { roundMoney, sameCents, toNumber } from "@/lib/paypal/amounts";
import { mainPaymentStatusError } from "@/lib/paypal/requestPaymentState";
import { settleAdditionalItemPayment } from "@/lib/paypal/settlement";
import {
  isMinor,
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

/** Marker states for `paypalWebhookEvents/{eventId}`. */
const CLAIM_STATUS_CLAIMED = "claimed";
const CLAIM_STATUS_PROCESSED = "processed";

/** Body-size ceiling for this route; see the check in the handler. */
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

/**
 * How long a claim is believed before a retry may take it over.
 *
 * Processing is one Firestore transaction and a notification, so anything beyond a few
 * seconds here means the attempt died. Two minutes is still shorter than PayPal's first
 * repeat interval, so a crashed attempt costs a retry rather than the event.
 */
const CLAIM_LEASE_MS = 2 * 60 * 1000;

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

  // The proxy never sees this route (raw-body signature verification), so the
  // body-size ceiling the proxy applies to every other API route is enforced
  // here instead, before a byte is read. PayPal webhooks are a few kilobytes;
  // a 1 MB ceiling is generous.
  const declaredLength = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: "Request body is too large.",
        code: "REQUEST_BODY_TOO_LARGE",
      },
      { status: 413 }
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

  /*
   * Claim the event before processing it, not after.
   *
   * Checking for a marker and writing one afterwards is a check-then-act race: two
   * simultaneous deliveries of the same id both see "not seen", both process, and only
   * then does one of the writes find the other. A transaction on the marker document
   * serialises the two, so exactly one of them gets to work.
   *
   * The claim is released when processing fails, because PayPal's retry must be able to
   * try again - the failure path is the reason the marker used to be written last. A
   * claim that is never released (the process died mid-flight) expires after the lease,
   * which is what stops one crashed attempt from swallowing an event for good.
   */
  const eventRef = adminDb.collection("paypalWebhookEvents").doc(eventId);
  const claimId = randomUUID();

  const claim = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(eventRef);
    const now = Date.now();

    if (!snapshot.exists) {
      transaction.set(eventRef, {
        status: CLAIM_STATUS_CLAIMED,
        claimId,
        // Epoch millis rather than a server timestamp: the lease is compared here, and
        // two minutes is coarse enough that a server clock skips nothing.
        claimedAt: now,
        eventType: event.event_type ?? "unknown",
      });

      return "claimed" as const;
    }

    const data = (snapshot.data() ?? {}) as Record<string, unknown>;

    // A marker with no status predates this claim and was only written after success.
    if (data.status !== CLAIM_STATUS_CLAIMED) return "duplicate" as const;

    const claimedAt =
      typeof data.claimedAt === "number" ? data.claimedAt : null;

    // An unreadable claim time is treated as fresh: stealing a claim we cannot date is
    // how an event gets processed twice.
    if (claimedAt === null || now - claimedAt < CLAIM_LEASE_MS) {
      return "duplicate" as const;
    }

    // The attempt that claimed this died without releasing it. Take it over.
    transaction.update(eventRef, {
      claimId,
      claimedAt: now,
      eventType: event.event_type ?? "unknown",
    });

    return "claimed" as const;
  });

  if (claim === "duplicate") {
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

    /*
     * Release the claim so PayPal's retry can process the event. Deleting only our own
     * claim matters: if a takeover happened, the marker belongs to another attempt and
     * removing it would let the next delivery run in parallel with it.
     */
    try {
      await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(eventRef);
        const data = (snapshot.data() ?? {}) as Record<string, unknown>;

        if (snapshot.exists && data.claimId === claimId) {
          transaction.delete(eventRef);
        }
      });
    } catch (releaseError) {
      // Better a stuck claim, which expires, than a 500 that hides the real failure.
      webhookLogger.error("Could not release the webhook claim", {
        eventId,
        error: releaseError instanceof Error ? releaseError.message : "unknown",
      });
    }

    // Return 500 so PayPal will retry the webhook delivery.
    return NextResponse.json(
      {
        success: false,
        error: "Webhook processing failed.",
        code: "WEBHOOK_PROCESSING_ERROR",
      },
      { status: 500 }
    );
  }

  await eventRef.set(
    {
      status: CLAIM_STATUS_PROCESSED,
      claimId,
      eventType: event.event_type ?? "unknown",
      processedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

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
  const capturedCurrency = capture.amount?.currency_code || "USD";
  const expectedCurrency = String(paymentOrder.currency ?? "USD").toUpperCase();

  if (capturedCurrency.toUpperCase() !== expectedCurrency) {
    throw new Error(
      `PayPal capture currency mismatch: expected ${expectedCurrency}, got ${capturedCurrency}`
    );
  }

  if (!sameCents(capturedAmount, expectedAmount)) {
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

  /*
   * An add-on order settles its own way, and it must branch BEFORE the main
   * settlement below: the add-on is bought after the main payment, so the
   * request is normally already "paid" here. The main path's already-paid
   * early return would mark this order completed without recording the item
   * as paid or writing an additionalPayments entry — the add-on would keep
   * showing awaiting_payment (a second charge waiting to happen) and the
   * daily reconciliation would report order_completed_addon_not_settled
   * forever. Settle it exactly as the browser capture and the sweep do.
   */
  if (paymentOrder.paymentType === "additional_item") {
    const additionalItemRequestId = paymentOrder.additionalItemRequestId;
    if (typeof additionalItemRequestId !== "string" || !additionalItemRequestId) {
      // Throw so PayPal retries: marking the order complete here would strand
      // a captured charge with nothing settled and nothing reporting it.
      throw new Error(
        `Additional-item order ${orderId} has no additionalItemRequestId.`
      );
    }

    const requestSnapshot = await requestRef.get();
    const requestData = requestSnapshot.data();
    if (!requestData) {
      // Same answer as the main path: acknowledge rather than retry forever;
      // reconciliation reports a completed order pointing at a missing request.
      webhookLogger.warn("Request not found for additional-item order", {
        orderId,
        requestId,
      });
      return;
    }

    const settlement = await settleAdditionalItemPayment({
      requestRef,
      paymentOrderRef,
      requestData,
      paymentOrder,
      additionalItemRequestId,
      orderID: orderId,
      captureId: captureId ?? "",
      capturedAmount,
      capturedCurrency,
    });

    if (!settlement.ok) {
      // A refusal (item not awaiting payment, amount mismatch) throws so the
      // delivery retries; a retry after a partial settlement sees the completed
      // order at the top of this handler and no-ops.
      throw new Error(settlement.error);
    }

    return;
  }

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
    if (
      requestData.status === "paid" ||
      requestData.payment?.status === "completed"
    ) {
      transaction.update(paymentOrderRef, {
        status: "completed",
        captureId,
        capturedAmount,
        capturedCurrency,
        completedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const statusError = mainPaymentStatusError(requestData.status);
    if (statusError) {
      throw new Error(statusError);
    }

    /*
     * The balance is read through `storedMinor` (ADR-0008, phase 2) so this
     * path understands both the decimal field a legacy wallet holds and the
     * integer one a migrated wallet will hold. The debit itself happens in
     * minor units; only the write below converts back.
     */
    let newBalanceMinor = storedMinor(walletSnapshot.data(), "balance");
    const walletAppliedMinor = minorFromStored(walletApplied);

    if (!isMinor(newBalanceMinor) || newBalanceMinor < 0) {
      throw new Error(`Wallet balance is invalid for ${orderId}`);
    }

    if (!isMinor(walletAppliedMinor) || walletAppliedMinor < 0) {
      throw new Error(`Stored wallet amount is invalid for ${orderId}`);
    }

    if (walletApplied > 0 && !ledgerSnapshot.exists) {
      if (!walletSnapshot.exists) {
        // Wallet document missing but payment order says wallet was used.
        // Throw to trigger a retry rather than silently skipping the debit.
        throw new Error(
          `Wallet document missing for user ${userId} but walletApplied=${walletApplied}`
        );
      }

      if (walletAppliedMinor > newBalanceMinor) {
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
