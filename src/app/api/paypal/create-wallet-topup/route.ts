import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";

async function getPayPalAccessToken() {
  const clientId =
    process.env.PAYPAL_CLIENT_ID;

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
      body:
        "grant_type=client_credentials",
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (
    !response.ok ||
    !data.access_token
  ) {
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
    /*
     * Authenticate Firebase user.
     */
    const authorization =
      request.headers.get(
        "authorization"
      );

    if (
      !authorization?.startsWith(
        "Bearer "
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Authentication required.",
        },
        { status: 401 }
      );
    }

    const idToken =
      authorization.substring(7);

    const decodedToken =
      await adminAuth.verifyIdToken(
        idToken
      );

    const userId =
      decodedToken.uid;

    /*
     * Validate amount.
     */
    const body =
      await request.json();

    const numericAmount =
      Number(body.amount);

    if (
      !Number.isFinite(
        numericAmount
      ) ||
      numericAmount <= 0
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

    if (
      numericAmount < 1 ||
      numericAmount > 10000
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Top-up amount must be between $1 and $10,000.",
        },
        { status: 400 }
      );
    }

    /*
     * Create PayPal order.
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
                amount: {
                  currency_code:
                    "USD",
                  value:
                    numericAmount.toFixed(
                      2
                    ),
                },

                description:
                  "ShipIN Wallet Top Up",
              },
            ],
          }),
        }
      );

    const paypalData =
      await paypalResponse.json();

    if (
      !paypalResponse.ok ||
      !paypalData.id
    ) {
      console.error(
        "PayPal wallet order creation failed:",
        paypalData
      );

      return NextResponse.json(
        {
          success: false,
          error:
            paypalData?.message ||
            "Could not create PayPal wallet top-up order.",
        },
        { status: 500 }
      );
    }

    const orderId =
      paypalData.id;

    /*
     * Store ownership server-side.
     *
     * The capture route will use this
     * document instead of trusting data
     * returned by PayPal.
     */
    await adminDb
      .collection(
        "walletTopupOrders"
      )
      .doc(orderId)
      .set({
        userId,

        amount:
          numericAmount,

        currency: "USD",

        orderId,

        status: "created",

        createdAt:
          new Date(),
      });

    return NextResponse.json({
      success: true,
      orderId,
    });
  } catch (error) {
    console.error(
      "Create wallet top-up order error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create wallet top-up order.",
      },
      { status: 500 }
    );
  }
}