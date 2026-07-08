import { NextResponse } from "next/server";
import { sendShippedEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const {
      email,
      requestId,
      carrier,
      trackingNumber,
      trackingUrl,
    } = await req.json();

    console.log("SHIPPED EMAIL API HIT");
    console.log("Sending email to:", email);

    const success = await sendShippedEmail(
      email,
      requestId,
      carrier,
      trackingNumber,
      trackingUrl
    );

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send shipped email",
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
      "SHIPPED EMAIL API ERROR:",
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