import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

import { readAndValidateBody, whatsappTestBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/whatsapp/test
 *
 * INTERNAL TEST ENDPOINT — proves the WhatsApp credentials work.
 *
 * `requireAdmin` is the same gate every other admin route passes: App Check,
 * a verified admin ID token, the admin role, and an enrolled second factor
 * with a per-request code. This endpoint drives the business WhatsApp
 * account, so a weaker gate — an authenticated admin token with no MFA
 * proof — would be enough to send messages through it.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // --- 1. Authenticate the caller through the full admin gate ---
  try {
    await requireAdmin(request);
  } catch (error) {
    const authError = getAdminAuthError(error);

    return NextResponse.json(
      { success: false, error: authError.error },
      { status: authError.status, headers: NO_STORE }
    );
  }

  // --- 2. Validate input with strict schema (guarded parse) ---
  const parsed = await readAndValidateBody(request, whatsappTestBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error,
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const { phone } = parsed.data;

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
    console.error(
      "WhatsApp test failed:",
      error instanceof Error ? error.message : error
    );

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
