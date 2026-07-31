import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

type PaymentType = "main" | "additional_item";

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const baseUrl =
    process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com";

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured.");
  }

  const auth = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("PayPal access token error:", data);
    throw new Error("Failed to authenticate with PayPal.");
  }

  return data.access_token as string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      requestId,
      paymentType = "main",
      additionalItemRequestId,
    }: {
      requestId?: string;
      paymentType?: PaymentType;
      additionalItemRequestId?: string;
    } = body;

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

    const requestRef = adminDb
      .collection("requests")
      .doc(requestId);

    const requestSnapshot = await requestRef.get();

    if (!requestSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Request not found.",
        },
        { status: 404 }
      );
    }

    const requestData = requestSnapshot.data();

    if (!requestData) {
      return NextResponse.json(
        {
          success: false,
          error: "Request data not found.",
        },
        { status: 404 }
      );
    }

    let amount: number;
    let description: string;

    /*
     * MAIN QUOTATION PAYMENT
     */
    if (paymentType === "main") {
      const grandTotal =
        requestData?.quote?.breakdown?.grandTotal;

      if (
        typeof grandTotal !== "number" ||
        !Number.isFinite(grandTotal) ||
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

      amount = grandTotal;

      description = `ShipIN Request ${
        requestData.requestNumber || requestId
      }`;
    }

    /*
     * ADDITIONAL ITEM PAYMENT
     */
    else {
      if (!additionalItemRequestId) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Additional item request ID is required.",
          },
          { status: 400 }
        );
      }

      const additionalItems =
        requestData.additionalItemRequests || [];

      const additionalItem = additionalItems.find(
        (item: any) =>
          item.id === additionalItemRequestId
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

      if (additionalItem.status !== "awaiting_payment") {
        return NextResponse.json(
          {
            success: false,
            error:
              "This additional item is not awaiting payment.",
          },
          { status: 400 }
        );
      }

      const totalDue = additionalItem.totalDue;

      if (
        typeof totalDue !== "number" ||
        !Number.isFinite(totalDue) ||
        totalDue <= 0
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
       * Prevent creating another checkout if this
       * additional item has already been paid.
       */
      const additionalPayments =
        requestData.additionalPayments || [];

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

      amount = totalDue;

      description = `ShipIN Additional Item - ${
        requestData.requestNumber || requestId
      }`;
    }

    /*
     * CREATE PAYPAL ORDER
     */
    const accessToken = await getPayPalAccessToken();

    const baseUrl =
      process.env.PAYPAL_API_URL ||
      "https://api-m.sandbox.paypal.com";

    const paypalResponse = await fetch(
      `${baseUrl}/v2/checkout/orders`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          intent: "CAPTURE",

          purchase_units: [
            {
              reference_id:
                paymentType === "additional_item"
                  ? `${requestId}:${additionalItemRequestId}`
                  : requestId,

              description,

              amount: {
                currency_code: "USD",
                value: amount.toFixed(2),
              },

              custom_id: JSON.stringify({
                requestId,
                paymentType,
                additionalItemRequestId:
                  additionalItemRequestId || null,
              }),
            },
          ],
        }),
      }
    );

    const paypalData = await paypalResponse.json();

    if (!paypalResponse.ok) {
      console.error(
        "PayPal create order error:",
        paypalData
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "PayPal could not create the payment order.",
        },
        { status: paypalResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: paypalData.id,
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