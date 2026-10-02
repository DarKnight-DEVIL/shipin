import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import {
  sendNotification,
} from "@/lib/notifications/notificationService";

type PaymentType = "main" | "additional_item";

function toNumber(value: unknown): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;

  const clientSecret =
    process.env.PAYPAL_CLIENT_SECRET;

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

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const {
      requestId,
      orderID,
      amount,
      paymentType = "main",
      additionalItemRequestId,
    }: {
      requestId?: string;
      orderID?: string;
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
     * GET STORED PAYPAL PAYMENT ORDER
     * ========================================
     */

    const paymentOrderRef = adminDb
      .collection("paypalPaymentOrders")
      .doc(orderID);

    const paymentOrderSnapshot =
      await paymentOrderRef.get();

    if (!paymentOrderSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal payment order could not be verified.",
        },
        { status: 403 }
      );
    }

    const paymentOrder =
      paymentOrderSnapshot.data();

    if (!paymentOrder) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal payment order data could not be verified.",
        },
        { status: 403 }
      );
    }

    /*
     * ========================================
     * VERIFY PAYMENT ORDER
     * ========================================
     */

    if (
      paymentOrder.requestId !==
      requestId
    ) {
      console.error(
        "PayPal request ownership mismatch:",
        {
          storedRequestId:
            paymentOrder.requestId,
          requestId,
          orderID,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "This payment does not belong to the requested order.",
        },
        { status: 403 }
      );
    }

    if (
      paymentOrder.paymentType !==
      paymentType
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payment type does not match the PayPal order.",
        },
        { status: 403 }
      );
    }

    const storedAdditionalItemId =
      paymentOrder.additionalItemRequestId ||
      null;

    const requestedAdditionalItemId =
      additionalItemRequestId || null;

    if (
      storedAdditionalItemId !==
      requestedAdditionalItemId
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Additional item payment does not match the PayPal order.",
        },
        { status: 403 }
      );
    }

    /*
     * ========================================
     * VERIFY REQUEST OWNER
     * ========================================
     */

    const requestUserId =
      requestData.userId;

    const paymentOrderUserId =
      paymentOrder.userId;

    if (
      !requestUserId ||
      !paymentOrderUserId ||
      requestUserId !==
        paymentOrderUserId
    ) {
      console.error(
        "PayPal payment ownership mismatch:",
        {
          requestUserId,
          paymentOrderUserId,
          requestId,
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
     * ========================================
     * IDEMPOTENCY CHECK
     * ========================================
     */

    if (
      paymentOrder.status ===
      "completed"
    ) {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
        paymentType,
        captureId:
          paymentOrder.captureId ||
          null,
      });
    }

    /*
     * ========================================
     * VERIFY CLIENT AMOUNT
     * ========================================
     */

    const expectedPayPalAmount =
      Number(
        toNumber(
          paymentOrder.paypalAmount
        ).toFixed(2)
      );

    const clientAmount =
      Number(amount.toFixed(2));

    if (
      Math.abs(
        clientAmount -
          expectedPayPalAmount
      ) > 0.01
    ) {
      console.error(
        "Client PayPal amount mismatch:",
        {
          clientAmount,
          expectedPayPalAmount,
          requestId,
          orderID,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "The PayPal payment amount could not be verified.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * CAPTURE PAYPAL
     * ========================================
     */

    const accessToken =
      await getPayPalAccessToken();

    const baseUrl =
      process.env.PAYPAL_API_URL ||
      "https://api-m.sandbox.paypal.com";

    const paypalResponse =
      await fetch(
        `${baseUrl}/v2/checkout/orders/${orderID}/capture`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
            "Content-Type":
              "application/json",
          },
        }
      );

    const paypalData =
      await paypalResponse.json();

    if (!paypalResponse.ok) {
      console.error(
        "PayPal capture error:",
        paypalData
      );

      return NextResponse.json(
        {
          success: false,
          error:
            paypalData?.message ||
            "PayPal could not capture the payment.",
        },
        {
          status:
            paypalResponse.status,
        }
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
     * GET CAPTURE
     * ========================================
     */

    const capture =
      paypalData?.purchase_units?.[0]
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

    if (!captureId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal capture ID was not found.",
        },
        { status: 400 }
      );
    }

    const capturedAmount =
      Number(
        capture.amount?.value
      );

    const capturedCurrency =
      capture.amount?.currency_code;

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
      capturedCurrency !== "USD"
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

    /*
     * ========================================
     * VERIFY CAPTURE AMOUNT
     * ========================================
     */

    if (
      Math.abs(
        capturedAmount -
          expectedPayPalAmount
      ) > 0.01
    ) {
      console.error(
        "PayPal capture amount mismatch:",
        {
          expectedPayPalAmount,
          capturedAmount,
          orderID,
          requestId,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Captured payment amount does not match the expected PayPal payment.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * ADDITIONAL ITEM PAYMENT
     * ========================================
     */

    if (
      paymentType ===
      "additional_item"
    ) {
      const additionalItems =
        requestData.additionalItemRequests ||
        [];

      const additionalItemIndex =
        additionalItems.findIndex(
          (item: any) =>
            item.id ===
            additionalItemRequestId
        );

      if (
        additionalItemIndex === -1
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Additional item request could not be found.",
          },
          { status: 404 }
        );
      }

      const additionalItem =
        additionalItems[
          additionalItemIndex
        ];

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

      const storedBaseAmount =
        Number(
          toNumber(
            paymentOrder.baseAmount
          ).toFixed(2)
        );

      const additionalItemTotal =
        Number(
          toNumber(
            additionalItem.totalDue
          ).toFixed(2)
        );

      if (
        Math.abs(
          storedBaseAmount -
            additionalItemTotal
        ) > 0.01
      ) {
        console.error(
          "Additional item base amount mismatch:",
          {
            storedBaseAmount,
            additionalItemTotal,
            orderID,
          }
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "The additional item payment amount could not be verified.",
          },
          { status: 400 }
        );
      }

      /*
       * Mark additional item paid.
       */

      additionalItems[
        additionalItemIndex
      ] = {
        ...additionalItem,

        status: "paid",

        amountPaid:
          capturedAmount,

        paidAt: new Date(),
      };

      /*
       * Payment history.
       */

      const additionalPayment = {
        id: captureId,

        additionalItemRequestId,

        provider: "paypal",

        paymentMethod: "paypal",

        orderId: orderID,

        captureId,

        amount:
          capturedAmount,

        currency:
          capturedCurrency,

        status: "completed",

        paidAt:
          new Date().toISOString(),
      };

      /*
       * Update request.
       */

      await requestRef.update({
        additionalItemRequests:
          additionalItems,

        items:
          FieldValue.arrayUnion({
            name:
              additionalItem.item
                ?.name,

            url:
              additionalItem.item
                ?.url || "",

            quantity:
              additionalItem.item
                ?.quantity,

            unitPrice:
              additionalItem.unitPrice,

            subtotal:
              additionalItem.subtotal,
          }),

        additionalPayments:
          FieldValue.arrayUnion(
            additionalPayment
          ),

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      /*
       * Mark PayPal payment order
       * as completed.
       */

      await paymentOrderRef.update({
        status: "completed",

        captureId,

        capturedAmount,

        capturedCurrency,

        completedAt:
          FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        success: true,

        paymentType:
          "additional_item",

        additionalItemRequestId,

        captureId,

        amountPaid:
          capturedAmount,

        paymentMethod:
          "paypal",
      });
    }

    /*
     * ========================================
     * MAIN PAYMENT
     * ========================================
     */

    const walletApplied =
      Number(
        toNumber(
          paymentOrder.walletApplied
        ).toFixed(2)
      );

    const totalRequired =
      Number(
        toNumber(
          paymentOrder.totalRequired
        ).toFixed(2)
      );

    const baseAmount =
      Number(
        toNumber(
          paymentOrder.baseAmount
        ).toFixed(2)
      );

    if (
      baseAmount <= 0 ||
      totalRequired <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The stored payment calculation is invalid.",
        },
        { status: 400 }
      );
    }

    /*
     * Verify:
     *
     * Total required
     * - Wallet applied
     * = PayPal amount
     */

    const calculatedPayPalAmount =
      Number(
        (
          totalRequired -
          walletApplied
        ).toFixed(2)
      );

    if (
      Math.abs(
        calculatedPayPalAmount -
          expectedPayPalAmount
      ) > 0.01
    ) {
      console.error(
        "Stored payment calculation mismatch:",
        {
          baseAmount,
          totalRequired,
          walletApplied,
          calculatedPayPalAmount,
          expectedPayPalAmount,
          orderID,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "The stored payment calculation could not be verified.",
        },
        { status: 400 }
      );
    }

    /*
     * ========================================
     * DETERMINE PAYMENT METHOD
     * ========================================
     *
     * IMPORTANT:
     * This is calculated server-side.
     * We do NOT trust the browser.
     */

    let paymentMethod:
      | "paypal"
      | "wallet_and_paypal";

    if (walletApplied > 0) {
      paymentMethod =
        "wallet_and_paypal";
    } else {
      paymentMethod =
        "paypal";
    }

    /*
     * ========================================
     * WALLET + PAYMENT TRANSACTION
     * ========================================
     */

    const walletRef = adminDb
      .collection("wallets")
      .doc(
        paymentOrder.userId
      );

    /*
     * Use a unique wallet transaction
     * document based on the PayPal
     * capture ID.
     */

    const walletTransactionRef =
      adminDb
        .collection(
          "walletTransactions"
        )
        .doc(
          `paypal_${captureId}`
        );

    await adminDb.runTransaction(
      async (transaction) => {
        /*
         * READS FIRST
         */

        const walletSnapshot =
          await transaction.get(
            walletRef
          );

        const paymentOrderSnapshot =
          await transaction.get(
            paymentOrderRef
          );

        const requestSnapshot =
          await transaction.get(
            requestRef
          );

        /*
         * Re-check payment order.
         */

        const currentPaymentOrder =
          paymentOrderSnapshot.data();

        if (
          !currentPaymentOrder
        ) {
          throw new Error(
            "PayPal payment order could not be found."
          );
        }

        /*
         * Another request may have
         * completed this payment.
         */

        if (
          currentPaymentOrder.status ===
          "completed"
        ) {
          return;
        }

        /*
         * Verify ownership again.
         */

        if (
          currentPaymentOrder.userId !==
          paymentOrder.userId
        ) {
          throw new Error(
            "Payment ownership verification failed."
          );
        }

        /*
         * Current wallet balance.
         */

        const currentBalance =
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
         * Wallet cannot become negative.
         */

        if (
          walletApplied >
          currentBalance + 0.01
        ) {
          throw new Error(
            "Insufficient wallet balance to complete this payment."
          );
        }

        /*
         * New balance.
         */

        const newBalance =
          Number(
            (
              currentBalance -
              walletApplied
            ).toFixed(2)
          );

        /*
         * ====================================
         * WALLET DEDUCTION
         * ====================================
         */

        if (walletApplied > 0) {
          transaction.set(
            walletRef,
            {
              balance:
                newBalance,

              currency:
                walletSnapshot.exists
                  ? walletSnapshot.data()
                      ?.currency ||
                    "USD"
                  : "USD",

              updatedAt:
                FieldValue.serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          transaction.set(
            walletTransactionRef,
            {
              userId:
                paymentOrder.userId,

              type: "payment",

              amount:
                -walletApplied,

              balanceAfter:
                newBalance,

              requestId,

              description:
                "Request Payment",

              createdAt:
                FieldValue.serverTimestamp(),
            }
          );
        }

        /*
         * ====================================
         * MARK REQUEST PAID
         * ====================================
         */

        transaction.update(
          requestRef,
          {
            status: "paid",

            payment: {
              provider:
                paymentMethod,

              paymentMethod,

              orderId:
                orderID,

              captureId,

              amount:
                totalRequired,

              amountPaid:
                totalRequired,

              paypalAmount:
                capturedAmount,

              walletAmount:
                walletApplied,

              quoteAmount:
                baseAmount,

              currency:
                capturedCurrency,

              status:
                "completed",

              paidAt:
                FieldValue.serverTimestamp(),
            },

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );

        /*
         * ====================================
         * MARK PAYPAL ORDER COMPLETE
         * ====================================
         */

        transaction.update(
          paymentOrderRef,
          {
            status: "completed",

            captureId,

            capturedAmount,

            capturedCurrency,

            completedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    /*
     * ========================================
     * PAYMENT NOTIFICATION
     * ========================================
     */

    try {
      const userId =
        requestData.userId;

      const customerName =
        requestData.customerName ||
        requestData.shippingAddress
          ?.firstName ||
        "Customer";

      await sendNotification({
        userId,

        requestId,

        title:
          "Payment Received",

        message:
          "We’ve received your payment successfully.",

        type: "payment",

        category: "payment",

        channels: {
          inApp: true,
          email: true,
          whatsapp: true,
        },

        whatsapp: {
          templateName:
            "shipin_payment_received",

          languageCode: "en",

          components: [
            {
              type: "body",

              parameters: [
                {
                  type: "text",
                  text: customerName,
                },
                {
                  type: "text",
                  text: requestId,
                },
              ],
            },
          ],
        },
      });
    } catch (error) {
      console.error(
        "Payment notification failed:",
        error
      );
    }

    /*
     * ========================================
     * SUCCESS
     * ========================================
     */

    return NextResponse.json({
      success: true,

      paymentType: "main",

      captureId,

      paymentMethod,

      paypalAmount:
        capturedAmount,

      walletAmount:
        walletApplied,

      totalAmount:
        totalRequired,
    });

  } catch (error) {
    console.error(
      "PayPal capture order route error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while capturing the PayPal payment.",
      },
      { status: 500 }
    );
  }
}