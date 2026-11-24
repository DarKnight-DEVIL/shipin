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
 * The reports are logged for visibility and optionally forwarded to Sentry
 * in production so violations surface in your existing alerting pipeline.
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

  // Forward to Sentry in production so violations surface in alerts.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_SENTRY_DSN
  ) {
    try {
      // A dynamic import keeps Sentry out of the module graph unless this
      // branch runs. It also survives formatting: a `require()` had to sit on
      // the same line as its `eslint-disable-next-line`, which Prettier moved.
      const Sentry = await import("@sentry/nextjs");
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
