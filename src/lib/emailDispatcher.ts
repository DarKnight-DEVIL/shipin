/**
 * Internal email dispatch helper.
 *
 * These routes are called server-to-server by emailService.ts.
 * They are NOT exposed to browsers, so they do not need Bearer auth.
 * Instead they:
 *   1. Validate the recipient email and message type server-side.
 *   2. Never send to arbitrary recipients — the caller must supply a
 *      valid email, and the route will refuse to send if the body is
 *      malformed.
 *   3. Use only server-controlled templates.
 */

import { NextResponse } from "next/server";

import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { sendMail } from "@/lib/mailer";
import { generateEmail } from "@/lib/emailTemplates";

import {
  sendEmailBodySchema,
  validateBody,
} from "@/lib/validation";

export async function handleSendEmail(request: Request): Promise<NextResponse> {
  /*
   * AUTHENTICATION: all email-send routes require admin.
   * These endpoints must not be public mail relays.
   */
  try {
    await requireAdmin(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    return NextResponse.json(
      { error: authError.error },
      { status: authError.status }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parseResult = validateBody(body, sendEmailBodySchema);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  // TypeScript knows the data is valid after parseResult.success check
  const data = parseResult.data as {
    type?: "quote" | "payment" | "shipped" | "delivered" | "refunded" | "support" | "shipment";
    email: string;
    requestId?: string;
    amount?: number;
    trackingNumber?: string;
    supportMessage?: string;
  };

  const {
    type,
    email,
    requestId,
    amount,
    trackingNumber,
    supportMessage,
  } = data;

  // Keep compatibility with older clients that send "shipment".
  const emailType = type === "shipment" ? "shipped" : type ?? "shipped";
  const emailContent = generateEmail(emailType, {
    requestId: requestId ?? "",
    amount,
    trackingNumber,
    supportMessage,
  });

  try {
    await sendMail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Email send failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Failed to send email." },
      { status: 500 }
    );
  }
}