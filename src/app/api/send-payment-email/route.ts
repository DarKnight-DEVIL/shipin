import { NextResponse } from "next/server";
import { sendPaymentReceivedEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const {
      email,
      requestId,
      amount,
    } = await req.json();

    console.log("PAYMENT EMAIL API HIT");
    console.log("Sending email to:", email);

    const success =
      await sendPaymentReceivedEmail(
        email,
        requestId,
        amount
      );

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send payment email",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "PAYMENT EMAIL API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}