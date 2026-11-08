import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

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

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/send-email
 * Sends only server-defined ShipIN templates and is restricted to admins.
 * The rate limiter is process-local; use a shared store/WAF for global limits.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // Email delivery is privileged: authenticated customers must not be able
  // to use this endpoint as an arbitrary-recipient mail relay.
  try {
    await requireAdmin(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    return NextResponse.json(
      {
        success: false,
        error: authError.error,
        code: authError.status === 401 ? "AUTHENTICATION_REQUIRED" : "AUTHORIZATION_ERROR",
      },
      { status: authError.status, headers: NO_STORE }
    );
  }

  const rateLimit = await strictRateLimiter.record(request);
  const rateHeaders = new Headers();
  addRateLimitHeaders(rateHeaders, rateLimit);
  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many emails sent. Please try again later.",
        code: "RATE_LIMIT_ERROR",
      },
      { status: 429, headers: rateHeaders }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body.", code: "INVALID_JSON" },
      { status: 400, headers: NO_STORE }
    );
  }

    const parseResult = validateBody(body, sendEmailBodySchema);
    if (!parseResult.success) {
      return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
        code: "VALIDATION_ERROR",
        errors: parseResult.errors,
      },
      { status: 400, headers: NO_STORE }
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

    return NextResponse.json({ success: true }, { status: 200, headers: rateHeaders });
});
