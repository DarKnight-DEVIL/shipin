import { NextResponse } from "next/server";
import { sendSupportReplyEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const {
      email,
      requestId,
      reply,
    } = await req.json();

    console.log("SUPPORT EMAIL API HIT");
    console.log("Sending email to:", email);

    const success =
      await sendSupportReplyEmail(
        email,
        requestId,
        reply
      );

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send support email",
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
      "SUPPORT EMAIL ERROR:",
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