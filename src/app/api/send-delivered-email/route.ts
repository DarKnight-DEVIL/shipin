import { NextResponse } from "next/server";
import { sendDeliveredEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { email, requestId } = await req.json();

    console.log("DELIVERED EMAIL API HIT");
    console.log("Sending email to:", email);

    const success = await sendDeliveredEmail(
      email,
      requestId
    );

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send delivered email",
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
      "DELIVERED EMAIL ERROR:",
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