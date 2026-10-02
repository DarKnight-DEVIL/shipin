import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { isQuoteExpired } from "@/lib/quoteExpiry";
import { calculateProcessingFee } from "@/features/finance/calculateProcessingFee";

type PaymentType = "main" | "additional_item";

const PAYPAL_PERCENTAGE = 0.044;
const PAYPAL_FIXED_FEE = 0.30;

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  const baseUrl =
    process.env.PAYPAL_API_URL ||
    "https://api-m.sandbox.paypal.com";

  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal credentials are not configured."
    );
  }

  const auth = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const response = await fetch(
    `${baseUrl}/v1/oauth2/token`,
    {
      method: "POST",

      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },

      body: "grant_type=client_credentials",

      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "PayPal access token error:",
      data
    );

    throw new Error(
      "Failed to authenticate with PayPal."
    );
  }

  return data.access_token as string;
}

/**
 * Safely converts a Firestore value into a number.
 */
function toNumber(value: unknown): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

export async function POST(
  request: NextRequest
) {
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

    /*
     * ========================================
     * VALIDATION
     * ========================================
     */

    if (!requestId) {
      return NextResponse.json(
        {
          success: false,
          error: "Request ID is required.",
        },
        { status: 400 }
      );
    }

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid PayPal payment amount is required.",
        },
        { status: 400 }
      );
    }

    if (
      paymentType !== "main" &&
      paymentType !== "additional_item"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid payment type.",
        },
        { status: 400 }
      );
    }

    if (
      paymentType === "additional_item" &&
      !additionalItemRequestId
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Additional item request ID is required.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * GET REQUEST
     * ========================================
     */

    const requestRef = adminDb
      .collection("requests")
      .doc(requestId);

    const requestSnapshot =
      await requestRef.get();

    if (!requestSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Request not found.",
        },
        { status: 404 }
      );
    }

    const requestData =
      requestSnapshot.data();

    if (!requestData) {
      return NextResponse.json(
        {
          success: false,
          error: "Request data not found.",
        },
        { status: 404 }
      );
    }

    /*
     * ========================================
     * MAIN PAYMENT
     * ========================================
     */

    let baseAmount: number;
    let description: string;

    if (paymentType === "main") {
      /*
       * Block expired quotations.
       */

      if (
        isQuoteExpired(
          requestData.quote?.expiresAt
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This quotation has expired. Please request a new quote.",
          },
          { status: 400 }
        );
      }

      const grandTotal = toNumber(
        requestData.quote?.breakdown
          ?.grandTotal
      );

      if (
        grandTotal <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "A valid quotation amount could not be found.",
          },
          { status: 400 }
        );
      }

      /*
       * This is the ShipIN quotation total.
       *
       * It already contains:
       *
       * Products
       * + ShipIN service fee
       * + inspection
       * + hold
       * + shipping
       */
      baseAmount = Number(
        grandTotal.toFixed(2)
      );

      description =
        `ShipIN Request ${
          requestData.requestNumber ||
          requestId
        }`;
    }

    /*
     * ========================================
     * ADDITIONAL ITEM PAYMENT
     * ========================================
     */

    else {
      const additionalItems =
        requestData.additionalItemRequests ||
        [];

      const additionalItem =
        additionalItems.find(
          (item: any) =>
            item.id ===
            additionalItemRequestId
        );

      if (!additionalItem) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Additional item request could not be found.",
          },
          { status: 404 }
        );
      }

      if (
        additionalItem.status !==
        "awaiting_payment"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This additional item is not awaiting payment.",
          },
          { status: 400 }
        );
      }

      const additionalItemAmount =
        toNumber(
          additionalItem.totalDue
        );

      if (
        additionalItemAmount <= 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "A valid additional item payment amount could not be found.",
          },
          { status: 400 }
        );
      }

      /*
       * Prevent duplicate additional-item
       * checkout creation.
       */

      const additionalPayments =
        requestData.additionalPayments ||
        [];

      const existingCompletedPayment =
        additionalPayments.find(
          (payment: any) =>
            payment.additionalItemRequestId ===
              additionalItemRequestId &&
            payment.status === "completed"
        );

      if (existingCompletedPayment) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This additional item has already been paid.",
          },
          { status: 409 }
        );
      }

      baseAmount = Number(
        additionalItemAmount.toFixed(2)
      );

      description =
        `ShipIN Additional Item - ${
          requestData.requestNumber ||
          requestId
        }`;
    }

    /*
     * ========================================
     * PAYPAL PROCESSING FEE
     * ========================================
     *
     * ShipIN does not absorb PayPal's fee.
     *
     * Example:
     *
     * ShipIN amount: $100
     *
     * PayPal:
     * 4.4% + $0.30
     *
     * Customer must pay approximately:
     * $104.92
     */

    const processing =
      calculateProcessingFee({
        amount: baseAmount,
        percentage:
          PAYPAL_PERCENTAGE,
        fixedFee:
          PAYPAL_FIXED_FEE,
        absorbFee: false,
      });

    const totalRequired =
      Number(
        processing.totalToCharge.toFixed(2)
      );

    /*
     * ========================================
     * WALLET
     * ========================================
     *
     * The frontend sends the amount that it
     * believes PayPal should collect.
     *
     * We DO NOT blindly trust it.
     *
     * Instead:
     *
     * totalRequired - requested PayPal amount
     * =
     * wallet amount requested
     */

    const requestedPayPalAmount =
      Number(amount.toFixed(2));

    if (
      requestedPayPalAmount >
      totalRequired + 0.01
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal payment amount exceeds the amount due.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * GET WALLET
     * ========================================
     *
     * The request's owner is used for the
     * wallet lookup.
     */

    const userId =
      requestData.userId;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Request owner could not be determined.",
        },
        { status: 400 }
      );
    }

    const walletRef = adminDb
      .collection("wallets")
      .doc(userId);

    const walletSnapshot =
      await walletRef.get();

    const walletBalance =
      walletSnapshot.exists
        ? Math.max(
            0,
            toNumber(
              walletSnapshot.data()
                ?.balance
            )
          )
        : 0;

    /*
     * ========================================
     * CALCULATE WALLET APPLICATION
     * ========================================
     */

    const requestedWalletAmount =
      Number(
        (
          totalRequired -
          requestedPayPalAmount
        ).toFixed(2)
      );

    /*
     * If no wallet is being used,
     * requestedWalletAmount should be 0.
     */

    if (
      requestedWalletAmount < -0.01
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid payment amount.",
        },
        { status: 400 }
      );
    }

    /*
     * A customer cannot apply more wallet
     * balance than they actually have.
     */

    if (
      requestedWalletAmount >
      walletBalance + 0.01
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The requested wallet amount exceeds the available wallet balance.",
        },
        { status: 400 }
      );
    }

    const walletApplied =
      Math.max(
        0,
        Math.min(
          requestedWalletAmount,
          walletBalance
        )
      );

    const expectedPayPalAmount =
      Number(
        (
          totalRequired -
          walletApplied
        ).toFixed(2)
      );

    /*
     * Make absolutely sure the amount
     * requested by the browser matches
     * the amount calculated by the server.
     */

    if (
      Math.abs(
        requestedPayPalAmount -
          expectedPayPalAmount
      ) > 0.01
    ) {
      console.error(
        "PayPal amount mismatch:",
        {
          baseAmount,
          totalRequired,
          walletBalance,
          walletApplied,
          requestedPayPalAmount,
          expectedPayPalAmount,
          requestId,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Payment amount could not be verified.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * CREATE PAYPAL ORDER
     * ========================================
     */

    const accessToken =
      await getPayPalAccessToken();

    const baseUrl =
      process.env.PAYPAL_API_URL ||
      "https://api-m.sandbox.paypal.com";

    const paypalResponse =
      await fetch(
        `${baseUrl}/v2/checkout/orders`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            intent: "CAPTURE",

            purchase_units: [
              {
                reference_id:
                  paymentType ===
                  "additional_item"
                    ? `${requestId}:${additionalItemRequestId}`
                    : requestId,

                description,

                amount: {
                  currency_code: "USD",

                  value:
                    expectedPayPalAmount.toFixed(
                      2
                    ),
                },

                custom_id:
                  JSON.stringify({
                    requestId,
                    paymentType,
                    additionalItemRequestId:
                      additionalItemRequestId ||
                      null,
                  }),
              },
            ],
          }),
        }
      );

    const paypalData =
      await paypalResponse.json();

    if (!paypalResponse.ok) {
      console.error(
        "PayPal create order error:",
        paypalData
      );

      return NextResponse.json(
        {
          success: false,
          error:
            paypalData?.message ||
            "PayPal could not create the payment order.",
        },
        {
          status:
            paypalResponse.status,
        }
      );
    }

    if (!paypalData?.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal did not return an order ID.",
        },
        { status: 502 }
      );
    }

    /*
     * ========================================
     * STORE PAYMENT ORDER
     * ========================================
     *
     * This is critical.
     *
     * The capture route needs to know:
     *
     * - Which request this belongs to
     * - Which user owns it
     * - Original ShipIN amount
     * - PayPal processing fee
     * - Total required
     * - Wallet amount applied
     * - PayPal amount
     * - Payment type
     *
     * The capture route can then verify the
     * PayPal result before deducting wallet
     * money or marking the request as paid.
     */

    const paymentOrderRef =
      adminDb
        .collection(
          "paypalPaymentOrders"
        )
        .doc(paypalData.id);

    await paymentOrderRef.set({
      orderId:
        paypalData.id,

      requestId,

      userId,

      paymentType,

      additionalItemRequestId:
        additionalItemRequestId ||
        null,

      baseAmount,

      processingFee:
        processing.fee,

      totalRequired,

      walletApplied,

      paypalAmount:
        expectedPayPalAmount,

      currency: "USD",

      status: "created",

      createdAt:
        new Date(),
    });

    /*
     * ========================================
     * RESPONSE
     * ========================================
     */

    return NextResponse.json({
      success: true,

      orderId:
        paypalData.id,

      amount:
        expectedPayPalAmount,

      baseAmount,

      processingFee:
        processing.fee,

      totalRequired,

      walletApplied,

      paypalAmount:
        expectedPayPalAmount,
    });
  } catch (error) {
    console.error(
      "PayPal create order route error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while creating the PayPal order.",
      },
      { status: 500 }
    );
  }
}