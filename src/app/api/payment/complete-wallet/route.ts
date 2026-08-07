import { NextRequest, NextResponse } from "next/server";

import {
  getRequestById,
  markRequestPaid,
} from "@/lib/firestore";

import {
  deductFromWallet,
} from "@/lib/wallet";

export async function POST(req: NextRequest) {

  try {

    const {
      requestId,
      amount,
    } = await req.json();

    if (!requestId || !amount) {
      return NextResponse.json(
        {
          error: "Missing fields",
        },
        {
          status: 400,
        }
      );
    }

    const request =
      await getRequestById(requestId);

    if (!request) {
      return NextResponse.json(
        {
          error: "Request not found",
        },
        {
          status: 404,
        }
      );
    }

    if (!request.userId) {
      return NextResponse.json(
        {
          error: "Missing user",
        },
        {
          status: 400,
        }
      );
    }

    await deductFromWallet(
      request.userId,
      amount,
      requestId
    );

    await markRequestPaid(requestId, {
      orderId: "wallet",
      amount,
      provider: "wallet",
    });

    return NextResponse.json({
      success: true,
    });

  } catch (err) {

    console.error(err);

    return NextResponse.json(
      {
        error: "Unable to complete payment",
      },
      {
        status: 500,
      }
    );

  }

}