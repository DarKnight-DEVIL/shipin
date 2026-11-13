import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { requireAuthWithProfile } from "@/lib/auth";
import {
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";

import {
  whatsappTestBodySchema,
  validateBody,
} from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/whatsapp/test
 *
 * INTERNAL TEST ENDPOINT — requires admin authentication.
 *
 * Security controls:
 *   1. Requires a verified admin Firebase ID token (Bearer Authorization header).
 *   2. Phone numbers are validated server-side: digits only, 10-15 digits.
 *   3. No secret/third-party error details are echoed to the caller.
 *
 * This route proves the WhatsApp credentials work and would
 * otherwise be a spam/conduit endpoint.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // --- 1. Authenticate the caller (admin only) ---
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Verify the authenticated user has the admin role.
  // requireAuthWithProfile checks user existence but not role,
  // so we enforce the role here.
  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      {
        success: false,
        error: "Administrator access required.",
        code: "ADMIN_ACCESS_REQUIRED",
      },
      { status: 403, headers: NO_STORE }
    );
  }

  // --- 2. Validate input with strict schema ---
  const parseResult = validateBody(await request.json(), whatsappTestBodySchema);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
        code: "INVALID_REQUEST_BODY",
        errors: parseResult.errors,
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const { phone } = parseResult.data;

  // --- 3. Send the message (server-only service, never user-controllable) ---
  try {
    await sendWhatsAppTemplate({
      to: phone,
      templateName: "hello_world",
      languageCode: "en_US",
    });

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    // Log the real error server-side; do not leak third-party API details.
    console.error("WhatsApp test failed:", error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to send WhatsApp message.",
        code: "EXTERNAL_SERVICE_ERROR",
      },
      { status: 502, headers: NO_STORE }
    );
  }
});