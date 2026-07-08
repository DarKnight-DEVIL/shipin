import { NextResponse } from "next/server";
import { sendQuoteReadyEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const {
      email,
      requestId,
      total,
    } = await req.json();

    console.log("EMAIL API HIT");
    console.log("Sending email to:", email);

    const success =
      await sendQuoteReadyEmail(
        email,
        requestId,
        total
      );

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send email",
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
      "EMAIL API ERROR:",
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