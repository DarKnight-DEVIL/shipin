import {
  NextRequest,
  NextResponse,
} from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";

import { FieldValue } from "firebase-admin/firestore";

import { getPayPalAccessToken } from "@/lib/paypal";
import { fetchWithTimeout } from "@/lib/http";
import { requireAuthWithProfile } from "@/lib/auth";
import { withErrorHandler } from '@/utils/errors';
import { serverEnv } from "@/config/env";

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const bodyObj = body as Record<string, unknown> | null;
    const orderID = typeof bodyObj?.orderID === "string" ? bodyObj.orderID.trim() : "";
    const requestedAmount = typeof bodyObj?.amount === "number" ? bodyObj.amount : NaN;

    if (!orderID) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal Order ID is required.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(
        requestedAmount
      ) ||
      requestedAmount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid top-up amount.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * LOOK UP OUR OWN ORDER RECORD
     * ========================================
     */

    const topupOrderRef =
      adminDb
        .collection(
          "walletTopupOrders"
        )
        .doc(orderID);

    const topupOrderSnapshot =
      await topupOrderRef.get();

    if (
      !topupOrderSnapshot.exists
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Wallet top-up order was not found.",
        },
        { status: 404 }
      );
    }

    const topupOrder =
      topupOrderSnapshot.data();

    /*
     * Verify ownership.
     */
    if (
      topupOrder?.userId !==
      authenticatedUserId
    ) {
      console.error(
        "Wallet ownership mismatch:",
        {
          orderUserId:
            topupOrder?.userId,
          authenticatedUserId,
          orderID,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "This payment does not belong to the authenticated account.",
        },
        { status: 403 }
      );
    }

    /*
     * Verify the amount recorded when
     * the order was created.
     */
    const storedAmount =
      Number(topupOrder.amount);

    if (
      !Number.isFinite(
        storedAmount
      ) ||
      Math.abs(
        storedAmount -
          requestedAmount
      ) > 0.01
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Top-up amount does not match the original order.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * CAPTURE PAYPAL ORDER
     * ========================================
     */

    const accessToken =
      await getPayPalAccessToken();

    const baseUrl =
      serverEnv.PAYPAL_API_URL ??
      "https://api-m.sandbox.paypal.com";

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

    const paypalData =
      await paypalResponse.json();

    /*
     * PayPal can return an error if this
     * order was already captured.
     *
     * We don't blindly credit the wallet.
     */
    if (!paypalResponse.ok) {
      console.error(
        "PayPal wallet capture error:",
        paypalData
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unable to process payment. Please try again.",
        },
        { status: paypalResponse.status }
      );
    }

    /*
     * ========================================
     * VERIFY PAYPAL STATUS
     * ========================================
     */

    if (
      paypalData.status !==
      "COMPLETED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal payment was not completed.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * EXTRACT CAPTURE
     * ========================================
     */

    const purchaseUnit =
      paypalData
        ?.purchase_units?.[0];

    const capture =
      purchaseUnit
        ?.payments?.captures?.[0];

    if (!capture) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal capture details were not found.",
        },
        { status: 400 }
      );
    }

    const captureId =
      capture.id;

    const capturedAmount =
      Number(
        capture.amount?.value
      );

    const capturedCurrency =
      capture.amount
        ?.currency_code;

    /*
     * ========================================
     * VERIFY CAPTURE AMOUNT
     * ========================================
     */

    if (
      !Number.isFinite(
        capturedAmount
      ) ||
      capturedAmount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid PayPal capture amount.",
        },
        { status: 400 }
      );
    }

    if (
      capturedCurrency !==
      "USD"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unexpected PayPal payment currency.",
        },
        { status: 400 }
      );
    }

    if (
      Math.abs(
        capturedAmount -
          storedAmount
      ) > 0.01
    ) {
      console.error(
        "Wallet top-up amount mismatch:",
        {
          storedAmount,
          capturedAmount,
          orderID,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Captured payment amount does not match the wallet top-up.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * ATOMIC WALLET CREDIT
     * ========================================
     */

    const walletRef =
      adminDb
        .collection("wallets")
        .doc(
          authenticatedUserId
        );

    const transactionRef =
      adminDb
        .collection(
          "walletTransactions"
        )
        .doc(captureId);

    const result =
      await adminDb.runTransaction(
        async (transaction) => {
          const walletSnapshot =
            await transaction.get(
              walletRef
            );

          const transactionSnapshot =
            await transaction.get(
              transactionRef
            );

          /*
           * Already credited.
           */
          if (
            transactionSnapshot.exists
          ) {
            const existing =
              transactionSnapshot.data();

            return {
              alreadyProcessed: true,

              balance:
                Number(
                  existing?.balanceAfter ??
                    0
                ),
            };
          }

          const currentBalance =
            walletSnapshot.exists
              ? Number(
                  walletSnapshot.data()
                    ?.balance ?? 0
                )
              : 0;

          const newBalance =
            currentBalance +
            capturedAmount;

          /*
           * Update/create wallet.
           */
          if (
            walletSnapshot.exists
          ) {
            transaction.update(
              walletRef,
              {
                balance:
                  FieldValue.increment(
                    capturedAmount
                  ),

                currency: "USD",

                updatedAt:
                  FieldValue.serverTimestamp(),
              }
            );
          } else {
            transaction.set(
              walletRef,
              {
                balance:
                  capturedAmount,

                currency: "USD",

                createdAt:
                  FieldValue.serverTimestamp(),

                updatedAt:
                  FieldValue.serverTimestamp(),
              }
            );
          }

          /*
           * Create transaction record.
           */
          transaction.set(
            transactionRef,
            {
              userId:
                authenticatedUserId,

              type: "deposit",

              amount:
                capturedAmount,

              balanceAfter:
                newBalance,

              description:
                "PayPal Wallet Top Up",

              provider:
                "paypal",

              orderId:
                orderID,

              captureId,

              currency:
                capturedCurrency,

              createdAt:
                FieldValue.serverTimestamp(),
            }
          );

          /*
           * Mark our top-up order as
           * completed.
           */
          transaction.update(
            topupOrderRef,
            {
              status: "completed",

              captureId,

              capturedAmount,

              completedAt:
                FieldValue.serverTimestamp(),
            }
          );

          return {
            alreadyProcessed: false,

            balance:
              newBalance,
          };
        }
      );

    return NextResponse.json({
      success: true,

      alreadyProcessed:
        result.alreadyProcessed,

      balance:
        result.balance,

      amount:
        capturedAmount,

      currency:
        capturedCurrency,

      captureId,
    });
  } catch (error) {
    console.error(
      "Wallet top-up capture error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }

});