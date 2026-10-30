import { NextResponse } from "next/server";

import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { sendMail } from "@/lib/mailer";
import { generateEmail } from "@/lib/emailTemplates";
import {
  strictRateLimiter,
  addRateLimitHeaders,
} from "@/lib/rateLimiter";
import {
  sendEmailBodySchema,
  validateBody,
} from "@/lib/validation";

/**
 * POST /api/send-email
 * Sends only server-defined ShipIN templates and is restricted to admins.
 * The rate limiter is process-local; use a shared store/WAF for global limits.
 */
export async function POST(request: Request) {
  try {
    // Email delivery is privileged: authenticated customers must not be able
    // to use this endpoint as an arbitrary-recipient mail relay.
    try {
      await requireAdmin(request);
    } catch (error) {
      const authError = getAdminAuthError(error);
      return NextResponse.json(
        { error: authError.error },
        { status: authError.status }
      );
    }

    const rateLimit = await strictRateLimiter.record(request);
    const rateHeaders = new Headers();
    addRateLimitHeaders(rateHeaders, rateLimit);
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many emails sent. Please try again later." },
        { status: 429, headers: rateHeaders }
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

    const {
      type,
      email,
      requestId,
      amount,
      trackingNumber,
      supportMessage,
    } = parseResult.data;

    // Keep compatibility with older clients that send "shipment".
    const emailType = type === "shipment" ? "shipped" : type ?? "shipped";
    const emailContent = generateEmail(emailType, {
      requestId: requestId ?? "",
      amount,
      trackingNumber,
      supportMessage,
    });

    await sendMail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return NextResponse.json({ success: true }, { headers: rateHeaders });
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
