import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { requireAuthWithProfile } from "@/lib/auth";
import { getClientIp } from "@/lib/clientIp";
import { consentBodySchema, readAndValidateBody } from "@/lib/validation";
import {
  getUserConsentState,
  updateUserConsent,
  getConsentLog,
  getGrantedCategories,
  isConsentCategory,
} from "@/lib/compliance/consent";

/**
 * Consent changes shown in Settings.
 *
 * The cap is a window, not the history: the route fetches one extra row so
 * "more than this" is knowable without a count query, and returns that fact as
 * `consentLogMeta.truncated` for the UI to disclose. The complete log is in
 * `/api/user/export`.
 */
const CONSENT_LOG_LIMIT = 50;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const [state, log, granted] = await Promise.all([
    getUserConsentState(auth.profile.uid),
    getConsentLog(auth.profile.uid, CONSENT_LOG_LIMIT + 1),
    getGrantedCategories(auth.profile.uid),
  ]);

  return NextResponse.json({
    success: true,
    consentState: state,
    consentLog: log.slice(0, CONSENT_LOG_LIMIT),
    consentLogMeta: {
      limit: CONSENT_LOG_LIMIT,
      truncated: log.length > CONSENT_LOG_LIMIT,
    },
    grantedCategories: granted,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = await readAndValidateBody(request, consentBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  const { category, granted, version, method: methodStr } = parsed.data;

  // A category is a fixed vocabulary, not free text: anything else would record
  // consent for a category that does not exist.
  if (!isConsentCategory(category)) {
    return NextResponse.json(
      {
        success: false,
        error: "Unknown consent category.",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  const clientIp = getClientIp(request) ?? "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  await updateUserConsent({
    userId: auth.profile.uid,
    category,
    granted,
    version,
    method: methodStr,
    ip: clientIp,
    userAgent,
  });

  return NextResponse.json({
    success: true,
    message: granted ? "Consent granted" : "Consent withdrawn",
  });
});
