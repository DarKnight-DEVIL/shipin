import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";

import {
  FieldValue,
} from "firebase-admin/firestore";

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
        Authorization:
          `Basic ${auth}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body:
        "grant_type=client_credentials",
      cache: "no-store",
    }
  );

  const data =
    await response.json();

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
     * ========================================
     * AUTHENTICATE CUSTOMER
     * ========================================
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

    const authenticatedUserId =
      decodedToken.uid;

    /*
     * ========================================
     * VALIDATE REQUEST
     * ========================================
     */

    const body =
      await request.json();

    const orderID =
      body.orderID;

    const requestedAmount =
      Number(body.amount);

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
          error:
            paypalData?.message ||
            "PayPal could not capture the wallet payment.",
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
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while processing the wallet top-up.",
      },
      { status: 500 }
    );
  }
}