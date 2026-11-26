import { NextRequest, NextResponse } from "next/server";

import { childLogger } from "../../../../lib/logger";

import { adminDb } from "@/lib/firebaseAdmin";

import { FieldValue } from "firebase-admin/firestore";

import { getPayPalAccessToken } from "@/lib/paypal";
import { fetchWithTimeout } from "@/lib/http";
import { requireAuthWithProfile } from "@/lib/auth";
import { withErrorHandler } from "@/utils/errors";
import { settleWalletTopup } from "@/lib/wallet/settleWalletTopup";
import { serverEnv } from "@/config/env";
import { captureTopupBodySchema, readAndValidateBody } from "@/lib/validation";

/**
 * PayPal answers ORDER_ALREADY_CAPTURED when a capture for this order exists.
 *
 * That is not a failure: it is the shape of a retry after the money moved but
 * the wallet credit did not (a Firestore error, a timeout, a crashed instance).
 * The caller must reconcile with PayPal instead of telling the customer their
 * payment failed while their balance stayed flat.
 */
function isAlreadyCaptured(payload: unknown): boolean {
  const details = (payload as { details?: Array<{ issue?: string }> } | null)
    ?.details;
  return (
    Array.isArray(details) &&
    details.some((d) => d?.issue === "ORDER_ALREADY_CAPTURED")
  );
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  // --- 1. Authenticate and authorize the caller ---
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const authenticatedUserId = auth.token.uid;

  try {
    /*
     * ========================================
     * PARSE REQUEST BODY
     * ========================================
     */

    const parsed = await readAndValidateBody(request, captureTopupBodySchema);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body.",
        },
        { status: 400 }
      );
    }

    const { orderID, amount: requestedAmount } = parsed.data;

    /*
     * ========================================
     * LOOK UP OUR OWN ORDER RECORD
     * ========================================
     */

    const topupOrderRef = adminDb.collection("walletTopupOrders").doc(orderID);

    const topupOrderSnapshot = await topupOrderRef.get();

    if (!topupOrderSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Wallet top-up order was not found.",
        },
        { status: 404 }
      );
    }

    const topupOrder = topupOrderSnapshot.data();

    /*
     * Verify ownership.
     */
    if (topupOrder?.userId !== authenticatedUserId) {
      console.error("Wallet ownership mismatch:", {
        orderUserId: topupOrder?.userId,
        authenticatedUserId,
        orderID,
      });

      return NextResponse.json(
        {
          success: false,
          error: "This payment does not belong to the authenticated account.",
        },
        { status: 403 }
      );
    }

    /*
     * Verify the amount recorded when
     * the order was created.
     */
    const storedAmount = Number(topupOrder.amount);

    if (
      !Number.isFinite(storedAmount) ||
      Math.abs(storedAmount - requestedAmount) > 0.01
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Top-up amount does not match the original order.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * CAPTURE PAYPAL ORDER
     * ========================================
     */

    const accessToken = await getPayPalAccessToken();

    /*
     * Mark the capture as in flight BEFORE calling PayPal. If the process dies
     * between the capture and the wallet credit, this flag is what tells a
     * retry (and support) that money may have moved for this order, so the
     * capture is reconciled rather than blindly reported as failed.
     *
     * Written first on purpose: a failure here happens before any charge.
     */
    await topupOrderRef.set(
      {
        capturePending: true,
        captureStartedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const baseUrl =
      serverEnv.PAYPAL_API_URL ?? "https://api-m.sandbox.paypal.com";

    const paypalResponse = await fetchWithTimeout(
      `${baseUrl}/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    let paypalData = await paypalResponse.json();

    /*
     * PayPal can return an error if this
     * order was already captured: the previous attempt charged the customer but
     * did not credit the wallet. Fetch the order and let the idempotent credit
     * below finish the job (it keys on the capture id).
     */
    if (!paypalResponse.ok) {
      if (!isAlreadyCaptured(paypalData)) {
        console.error("PayPal wallet capture error:", paypalData);

        // PayPal refused the capture, so no money moved: clear the in-flight
        // flag instead of leaving the order looking like a charge that needs
        // reconciliation. Only the already-captured branch below keeps it.
        try {
          await topupOrderRef.set({ capturePending: false }, { merge: true });
        } catch (error) {
          console.error("Could not clear the pending-capture flag:", error);
        }

        return NextResponse.json(
          {
            success: false,
            error: "Unable to process payment. Please try again.",
          },
          { status: paypalResponse.status }
        );
      }

      const walletLogger = childLogger({ service: "capture-wallet-topup" });
      walletLogger.warn(
        "[capture-wallet-topup] reconciling an already-captured order",
        {
          orderID,
        }
      );

      const orderDetails = await fetchWithTimeout(
        `${baseUrl}/v2/checkout/orders/${orderID}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      paypalData = await orderDetails.json();

      if (!orderDetails.ok) {
        console.error(
          "PayPal order lookup after a duplicate capture failed:",
          paypalData
        );

        // The capture is pending and money may have moved: keep the flag so a
        // retry or the webhook reconciliation can pick it up.
        return NextResponse.json(
          {
            success: false,
            error:
              "Payment was captured but the wallet credit could not be confirmed. Please contact support.",
            code: "CAPTURE_PENDING_RECONCILIATION",
          },
          { status: 409 }
        );
      }
    }

    /*
     * ========================================
     * VERIFY PAYPAL STATUS
     * ========================================
     */

    if (paypalData.status !== "COMPLETED") {
      return NextResponse.json(
        {
          success: false,
          error: "PayPal payment was not completed.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * EXTRACT CAPTURE
     * ========================================
     */

    const purchaseUnit = paypalData?.purchase_units?.[0];

    const capture = purchaseUnit?.payments?.captures?.[0];

    if (!capture) {
      return NextResponse.json(
        {
          success: false,
          error: "PayPal capture details were not found.",
        },
        { status: 400 }
      );
    }

    const captureId = capture.id;

    const capturedAmount = Number(capture.amount?.value);

    const capturedCurrency = capture.amount?.currency_code;

    /*
     * ========================================
     * VERIFY CAPTURE AMOUNT
     * ========================================
     */

    /*
     * ========================================
     * CREDIT THE WALLET
     * ========================================
     *
     * One implementation, shared with the recovery sweep: two copies of a money
     * write drift, and this one has to be exactly refusable and exactly
     * idempotent. It verifies the capture against the stored order itself
     * (amount, currency, ledger keyed on captureId) inside the same transaction.
     */
    const settlement = await settleWalletTopup({
      topupOrderRef,
      topupOrder,
      capture: {
        captureId,
        amount: capturedAmount,
        currency: capturedCurrency,
      },
    });

    if (!settlement.ok) {
      return NextResponse.json(
        { success: false, error: settlement.error },
        { status: settlement.status }
      );
    }

    const result = settlement;

    return NextResponse.json({
      success: true,

      alreadyProcessed: result.alreadyProcessed,

      balance: result.balance,

      amount: capturedAmount,

      currency: capturedCurrency,

      captureId,
    });
  } catch (error) {
    console.error("Wallet top-up capture error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
});
