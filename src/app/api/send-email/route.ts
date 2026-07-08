import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { generateEmail } from "@/lib/emailTemplates";

export async function POST(req: NextRequest) {
  try {
    const {
      type,
      email,
      requestId,
      amount,
      trackingNumber,
      supportMessage,
    } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }
    console.log("✅ UNIVERSAL EMAIL API HIT");
    console.log("📨 EMAIL API");
    console.log("Type:", type);
    console.log("Recipient:", email);

    const emailContent = generateEmail(type, {
      requestId,
      amount,
      trackingNumber,
      supportMessage,
    });

    await sendMail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("EMAIL ERROR:", error);

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
}