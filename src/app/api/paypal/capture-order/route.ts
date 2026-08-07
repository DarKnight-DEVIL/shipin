import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import {
  sendNotification,
} from "@/lib/notifications/notificationService";

type PaymentType = "main" | "additional_item";

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

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const {
      requestId,
      orderID,
      paymentType = "main",
      additionalItemRequestId,
    }: {
      requestId?: string;
      orderID?: string;
      paymentType?: PaymentType;
      additionalItemRequestId?: string;
    } = body;


    /*
     * VALIDATION
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
          error: "PayPal Order ID is required.",
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
     * GET REQUEST FROM FIRESTORE
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
     * PREVENT DUPLICATE ADDITIONAL ITEM PAYMENT
     */

    if (
      paymentType === "additional_item"
    ) {
      const additionalPayments =
        requestData.additionalPayments || [];

      const alreadyPaid =
        additionalPayments.find(
          (payment: any) =>
            payment.additionalItemRequestId ===
              additionalItemRequestId &&
            payment.status === "completed"
        );

      if (alreadyPaid) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This additional item has already been paid.",
          },
          { status: 409 }
        );
      }
    }

    /*
     * CAPTURE PAYPAL ORDER
     */

    const accessToken =
      await getPayPalAccessToken();

    const baseUrl =
      process.env.PAYPAL_API_URL ||
      "https://api-m.sandbox.paypal.com";

    const paypalResponse = await fetch(
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
            "PayPal could not capture the payment.",
        },
        {
          status: paypalResponse.status,
        }
      );
    }

    /*
     * VERIFY PAYPAL PAYMENT STATUS
     */

    if (
      paypalData.status !== "COMPLETED"
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
     * GET CAPTURE DETAILS
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

    const captureId = capture.id;

    const capturedAmount = Number(
      capture.amount?.value
    );

    const capturedCurrency =
      capture.amount?.currency_code;

    if (
      !Number.isFinite(capturedAmount) ||
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
     * MAIN REQUEST PAYMENT
     */

    if (paymentType === "main") {
      const expectedAmount =
        requestData?.quote?.breakdown
          ?.grandTotal;

      if (
        typeof expectedAmount !==
          "number" ||
        !Number.isFinite(
          expectedAmount
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Expected quotation amount could not be verified.",
          },
          { status: 400 }
        );
      }

      /*
       * Compare amounts.
       * Math.abs protects against
       * floating-point rounding issues.
       */

      if (
        Math.abs(
          capturedAmount -
            expectedAmount
        ) > 0.01
      ) {
        console.error(
          "PayPal amount mismatch:",
          {
            expectedAmount,
            capturedAmount,
          }
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Captured payment amount does not match the quotation.",
          },
          { status: 400 }
        );
      }

      /*
       * Update MAIN request only.
       */

      await requestRef.update({
        status: "paid",

        payment: {
          provider: "paypal",
          orderId: orderID,
          captureId,
          amount: capturedAmount,
          currency: capturedCurrency,
          status: "completed",
          paidAt:
            FieldValue.serverTimestamp(),
        },

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      /*
       * PAYMENT RECEIVED NOTIFICATION
       *
       * Payment has already been verified by
       * PayPal before reaching this point.
       *
       * Notification preferences, channel
       * settings and WhatsApp consent are
       * enforced by notificationService.ts.
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
        /*
         * A notification failure must NEVER
         * turn a successful PayPal payment
         * into a failed payment response.
         */
        console.error(
          "Payment notification failed:",
          error
        );
      }

      return NextResponse.json({
        success: true,
        paymentType: "main",
        captureId,
      });
    }

    /*
     * ADDITIONAL ITEM PAYMENT
     */

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

    const expectedAmount =
      additionalItem.totalDue;

    if (
      typeof expectedAmount !==
        "number" ||
      !Number.isFinite(
        expectedAmount
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Expected additional item amount could not be verified.",
        },
        { status: 400 }
      );
    }

    /*
     * Verify PayPal charged
     * the correct amount.
     */

    if (
      Math.abs(
        capturedAmount -
          expectedAmount
      ) > 0.01
    ) {
      console.error(
        "Additional item PayPal amount mismatch:",
        {
          expectedAmount,
          capturedAmount,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Captured payment amount does not match the additional item quotation.",
        },
        { status: 400 }
      );
    }

    /*
     * Mark ONLY this additional
     * item as paid.
     *
     * Do NOT change the main
     * request status here.
     */

    additionalItems[
      additionalItemIndex
    ] = {
      ...additionalItem,

      status: "paid",

      amountPaid:
        capturedAmount,

      paidAt:
        new Date(),
    };

    /*
     * Store payment history.
     */

    const additionalPayment = {
      id: captureId,

      additionalItemRequestId,

      provider: "paypal",

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
     * Update Firestore.
     */

    await requestRef.update({
      /*
       * Update the additional item request.
       *
       * awaiting_payment → paid
       */
      additionalItemRequests:
        additionalItems,

      /*
       * Add the successfully paid item
       * to the main request product list.
       *
       * This happens ONLY after PayPal
       * confirms successful payment.
       */
      items:
        FieldValue.arrayUnion({
          name:
            additionalItem.item.name,

          url:
            additionalItem.item.url ||
            "",

          quantity:
            additionalItem.item.quantity,

          unitPrice:
            additionalItem.unitPrice,

          subtotal:
            additionalItem.subtotal,
        }),

      /*
       * Save the separate PayPal payment
       * record for this additional item.
       */
      additionalPayments:
        FieldValue.arrayUnion(
          additionalPayment
        ),

      updatedAt:
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

      {
        status: 500,
      }
    );
  }
}