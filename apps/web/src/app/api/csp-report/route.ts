import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

/**
 * POST /api/csp-report
 *
 * Receives Content-Security-Policy violation reports from the browser.
 *
 * CSP reporting is a passive monitoring tool — it does not block traffic,
 * it only surfaces policy violations so you can detect when a trusted
 * third-party script or inline code breaks the policy.
 *
 * The reports are logged for visibility and optionally forwarded to Sentry
 * in production so violations surface in your existing alerting pipeline.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  let report: unknown;
  try {
    report = await request.json();
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

  console.warn("[CSP Report]", {
    violatedDirective,
    blockedUri,
  });

  // Forward to Sentry in production so violations surface in alerts.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      // Lazy require avoids bundling Sentry into non-production bundles.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
      Sentry.captureMessage("CSP violation reported", {
        level: "warning",
        extra: { violatedDirective, blockedUri, report },
      });
    } catch {
      // Sentry transport failure must not break the report endpoint.
    }
  }

  return NextResponse.json({ received: true });
});