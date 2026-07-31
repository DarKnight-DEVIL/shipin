import { NextResponse } from "next/server";

import {
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();

    const phone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : "";

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error: "Phone number is required.",
        },
        {
          status: 400,
        }
      );
    }

    const result =
      await sendWhatsAppTemplate({
        to: phone,
        templateName: "hello_world",
        languageCode: "en_US",
      });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error(
      "WhatsApp test error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to send WhatsApp message.",
      },
      {
        status: 500,
      }
    );
  }
}