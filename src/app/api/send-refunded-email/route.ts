import { NextResponse } from "next/server";
import { sendRefundedEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { email, requestId } = await req.json();

    console.log("REFUND EMAIL API HIT");
    console.log("Sending email to:", email);

    const success = await sendRefundedEmail(
      email,
      requestId
    );

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send refund email",
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
      "REFUND EMAIL ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}