import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { childLogger } from "@/lib/logger";

const cspLogger = childLogger({ service: "csp-report" });

/**
 * POST /api/csp-report
 *
 * Receives Content-Security-Policy violation reports from the browser.
 *
 * CSP reporting is a passive monitoring tool — it does not block traffic,
 * it only surfaces policy violations so you can detect when a trusted
 * third-party script or inline code breaks the policy.
 *
 * The reports are logged for visibility; the deployment ships no error-reporting
 * SDK, so logging is where they surface.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // Bounded read: a real CSP report is a few hundred bytes, and this endpoint
  // is unauthenticated, so an oversized body is rejected before it is parsed
  // rather than after. The proxy's API limiter bounds volume, not size.
  const MAX_REPORT_CHARS = 8_000;
  const raw = await request.text();

  if (raw.length > MAX_REPORT_CHARS) {
    return NextResponse.json(
      { success: false, error: "Report too large.", code: "PAYLOAD_TOO_LARGE" },
      { status: 413 }
    );
  }

  let report: unknown;
  try {
    report = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // CSP violation reports are noisy by design — log a compact summary
  // rather than the full object so log volume stays manageable.
  const cspReport =
    report && typeof report === "object"
      ? (report as Record<string, unknown>)["csp-report"]
      : undefined;
  const violatedDirective =
    cspReport && typeof cspReport === "object"
      ? (cspReport as Record<string, unknown>)["violated-directive"]
      : undefined;
  const blockedUri =
    cspReport && typeof cspReport === "object"
      ? (cspReport as Record<string, unknown>)["blocked-uri"]
      : undefined;

  cspLogger.warn("CSP violation reported", {
    violatedDirective,
    blockedUri,
  });

  return NextResponse.json({ received: true });
});
