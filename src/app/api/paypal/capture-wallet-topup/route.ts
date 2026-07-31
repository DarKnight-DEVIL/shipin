import { NextResponse } from "next/server";

import {
  getPayPalAccessToken,
  PAYPAL_BASE,
} from "@/lib/paypal";

import { auth } from "@/lib/firebase";
import { depositToWallet } from "@/lib/wallet";

export async function POST(req: Request) {
  try {
    const { orderID, amount } =
      await req.json();

    const token =
      await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type":
            "application/json",
        },
      }
    );

    const result =
      await response.json();

    if (
      result.status !== "COMPLETED"
    ) {
      return NextResponse.json(
        {
          error:
            "Payment not completed.",
        },
        {
          status: 400,
        }
      );
    }

    const user =
      auth.currentUser;

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Not authenticated.",
        },
        {
          status: 401,
        }
      );
    }

    await depositToWallet(
      user.uid,
      Number(amount),
      "PayPal Wallet Top Up"
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Unable to top up wallet.",
      },
      {
        status: 500,
      }
    );
  }
}