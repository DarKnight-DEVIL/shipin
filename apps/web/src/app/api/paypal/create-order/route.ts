/**
 * `POST /api/paypal/create-order` — begin a PayPal checkout.
 *
 * This handler decides what the customer owes and how much of it PayPal should
 * collect; the customer's browser only nominates the PayPal share. The steps
 * must stay in this order:
 *
 * 1. Validate the body and load the request — the owner is read from Firestore,
 *    never from the request.
 * 2. Price the payment from the stored quote or add-on: the browser's `amount`
 *    is compared against it, never used to compute it.
 * 3. Derive the wallet part as `total − PayPal share` and refuse anything the
 *    wallet cannot cover.
 * 4. Create the PayPal order for the derived amount.
 * 5. Store the payment order the capture route will verify against.
 *
 * The arithmetic helpers and the PayPal call live in `@/lib/paypal`.
 */

import { NextRequest, NextResponse } from "next/server";

import { calculateProcessingFee } from "@/features/finance/services/calculateProcessingFee";
import { isQuoteExpired } from "@/features/requests/services/quoteExpiry";
import { requireAuthWithProfile } from "@/lib/auth";
import { PAYPAL_FIXED_FEE, PAYPAL_PERCENTAGE } from "@/config/constants";
import { adminDb } from "@/lib/firebaseAdmin";
import { roundMoney, sameCents, toNumber } from "@/lib/paypal/amounts";
import { createPayPalOrder } from "@/lib/paypal/createPayPalOrder";
import type { PaymentType } from "@/lib/paypal/types";
import type { AdditionalItemRequest } from "@/types/request";
import { withErrorHandler } from "@/utils/errors";

export const POST = withErrorHandler(async (request: NextRequest) => {
  // --- 1. Authenticate the caller ---
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    const {
      requestId,
      amount,
      paymentType = "main",
      additionalItemRequestId,
    }: {
      requestId?: string;
      amount?: number;
      paymentType?: PaymentType;
      additionalItemRequestId?: string;
    } = body;

    // --- 2. Validate the body ---
    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "Request ID is required." },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "A valid PayPal payment amount is required." },
        { status: 400 }
      );
    }

    if (paymentType !== "main" && paymentType !== "additional_item") {
      return NextResponse.json(
        { success: false, error: "Invalid payment type." },
        { status: 400 }
      );
    }

    if (paymentType === "additional_item" && !additionalItemRequestId) {
      return NextResponse.json(
        { success: false, error: "Additional item request ID is required." },
        { status: 400 }
      );
    }

    // --- 3. Load the request and prove the caller owns it ---
    const requestRef = adminDb.collection("requests").doc(requestId);
    const requestSnapshot = await requestRef.get();

    if (!requestSnapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404 }
      );
    }

    const requestData = requestSnapshot.data();

    if (!requestData) {
      return NextResponse.json(
        { success: false, error: "Request data not found." },
        { status: 404 }
      );
    }

    if (requestData.userId !== auth.profile.uid) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not have permission to pay for this request.",
        },
        { status: 403 }
      );
    }

    // --- 4. Price the payment from what ShipIN stored, not from the browser ---
    let baseAmount: number;
    let description: string;

    if (paymentType === "main") {
      if (isQuoteExpired(requestData.quote?.expiresAt)) {
        return NextResponse.json(
          {
            success: false,
            error: "This quotation has expired. Please request a new quote.",
          },
          { status: 400 }
        );
      }

      /*
       * The ShipIN quotation total: products + service fee + inspection + hold
       * + shipping. PayPal's own fee is added on top below.
       */
      const grandTotal = toNumber(requestData.quote?.breakdown?.grandTotal);

      if (grandTotal <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "A valid quotation amount could not be found.",
          },
          { status: 400 }
        );
      }

      baseAmount = roundMoney(grandTotal);
      description = `ShipIN Request ${requestData.requestNumber || requestId}`;
    } else {
      const additionalItems = (requestData.additionalItemRequests ||
        []) as AdditionalItemRequest[];

      const additionalItem = additionalItems.find(
        (item) => item.id === additionalItemRequestId
      );

      if (!additionalItem) {
        return NextResponse.json(
          {
            success: false,
            error: "Additional item request could not be found.",
          },
          { status: 404 }
        );
      }

      if (additionalItem.status !== "awaiting_payment") {
        return NextResponse.json(
          {
            success: false,
            error: "This additional item is not awaiting payment.",
          },
          { status: 400 }
        );
      }

      const additionalItemAmount = toNumber(additionalItem.totalDue);

      if (additionalItemAmount <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "A valid additional item payment amount could not be found.",
          },
          { status: 400 }
        );
      }

      // A paid add-on must not get a second checkout.
      const alreadyPaid = (
        Array.isArray(requestData.additionalPayments)
          ? requestData.additionalPayments
          : []
      ).some(
        (payment) =>
          typeof payment === "object" &&
          payment !== null &&
          "additionalItemRequestId" in payment &&
          payment.additionalItemRequestId === additionalItemRequestId &&
          "status" in payment &&
          payment.status === "completed"
      );

      if (alreadyPaid) {
        return NextResponse.json(
          {
            success: false,
            error: "This additional item has already been paid.",
          },
          { status: 409 }
        );
      }

      baseAmount = roundMoney(additionalItemAmount);
      description = `ShipIN Additional Item - ${
        requestData.requestNumber || requestId
      }`;
    }

    /*
     * ShipIN does not absorb PayPal's fee: on a $100 quote the customer pays
     * 4.4% + $0.30, so $104.92 reaches PayPal.
     */
    const processing = calculateProcessingFee({
      amount: baseAmount,
      percentage: PAYPAL_PERCENTAGE,
      fixedFee: PAYPAL_FIXED_FEE,
      absorbFee: false,
    });

    const totalRequired = roundMoney(processing.totalToCharge);
    const requestedPayPalAmount = roundMoney(amount);

    if (requestedPayPalAmount > totalRequired + 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: "PayPal payment amount exceeds the amount due.",
        },
        { status: 400 }
      );
    }

    // --- 5. Wallet: the complement of the PayPal share, capped by the balance ---
    const userId = requestData.userId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Request owner could not be determined." },
        { status: 400 }
      );
    }

    const walletRef = adminDb.collection("wallets").doc(userId);

    // Use a transaction to atomically check wallet balance and create payment order.
    // This prevents TOCTOU where another request drains the wallet between check and create.
    let paymentOrderResult: { walletApplied: number; expectedPayPalAmount: number };
    try {
      paymentOrderResult = await adminDb.runTransaction(async (transaction) => {
        const walletSnapshot = await transaction.get(walletRef);
        const walletBalance = walletSnapshot.exists
          ? Math.max(0, toNumber(walletSnapshot.data()?.balance))
          : 0;

        const requestedWalletAmount = roundMoney(
          totalRequired - requestedPayPalAmount
        );

        if (requestedWalletAmount < -0.01) {
          throw new Error("INVALID_PAYMENT_AMOUNT");
        }

        if (requestedWalletAmount > walletBalance + 0.01) {
          throw new Error("INSUFFICIENT_WALLET_BALANCE");
        }

        const walletApplied = Math.max(
          0,
          Math.min(requestedWalletAmount, walletBalance)
        );

        const expectedPayPalAmount = roundMoney(totalRequired - walletApplied);

        /*
         * Compare whole cents: a browser sending 100.01 for a 100.00 quote must not
         * be charged the extra cent.
         */
        if (!sameCents(requestedPayPalAmount, expectedPayPalAmount)) {
          console.error("PayPal amount mismatch:", {
            baseAmount,
            totalRequired,
            walletBalance,
            walletApplied,
            requestedPayPalAmount,
            expectedPayPalAmount,
            requestId,
          });
          throw new Error("PAYMENT_AMOUNT_MISMATCH");
        }

        // Return the calculated values; PayPal order creation and payment order storage
        // happen outside the transaction (PayPal API call is external).
        return { walletApplied, expectedPayPalAmount };
      });
    } catch (error) {
      if (error instanceof Error) {
        switch (error.message) {
          case "INVALID_PAYMENT_AMOUNT":
            return NextResponse.json(
              { success: false, error: "Invalid payment amount." },
              { status: 400 }
            );
          case "INSUFFICIENT_WALLET_BALANCE":
            return NextResponse.json(
              {
                success: false,
                error:
                  "The requested wallet amount exceeds the available wallet balance.",
              },
              { status: 400 }
            );
          case "PAYMENT_AMOUNT_MISMATCH":
            return NextResponse.json(
              { success: false, error: "Payment amount could not be verified." },
              { status: 400 }
            );
        }
      }
      throw error;
    }

    const { walletApplied, expectedPayPalAmount } = paymentOrderResult!;

    // --- 6. Create the PayPal order ---
    // Use a deterministic idempotency key so retries don't create duplicate orders.
    const idempotencyKey = `${requestId}:${paymentType}:${additionalItemRequestId ?? "main"}`;
    const created = await createPayPalOrder({
      requestId,
      description,
      paymentType,
      additionalItemRequestId,
      paypalAmount: expectedPayPalAmount,
      idempotencyKey,
    });

    if (!created.ok) {
      return NextResponse.json(
        { success: false, error: created.error },
        { status: created.status }
      );
    }

    /*
     * --- 7. Store the payment order ---
     *
     * The capture route verifies against this document: which request and user
     * the money is for, the ShipIN amount, the fee, the total, the wallet part
     * and the PayPal amount. Without it a captured PayPal order cannot become a
     * paid request.
     */
    const paymentOrderRef = adminDb
      .collection("paypalPaymentOrders")
      .doc(created.orderId);

    await paymentOrderRef.set({
      orderId: created.orderId,
      requestId,
      userId,
      paymentType,
      additionalItemRequestId: additionalItemRequestId || null,
      baseAmount,
      processingFee: processing.fee,
      totalRequired,
      walletApplied,
      paypalAmount: expectedPayPalAmount,
      currency: "USD",
      status: "created",
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      orderId: created.orderId,
      amount: expectedPayPalAmount,
      baseAmount,
      processingFee: processing.fee,
      totalRequired,
      walletApplied,
      paypalAmount: expectedPayPalAmount,
    });
  } catch (error) {
    console.error("PayPal create order route error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
});
