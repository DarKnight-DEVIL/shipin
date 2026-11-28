import { NextRequest, NextResponse } from "next/server";

import { recordClientError } from "@/lib/clientErrorMetrics";
import { strictRateLimiter } from "@/lib/rateLimiter";
import { clientErrorBodySchema, readAndValidateBody } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";

export const runtime = "nodejs";

/**
 * POST /api/client-errors
 *
 * Anonymous on purpose: the errors worth having are exactly the ones that
 * happen before anyone is signed in (the login page, the payment return). The
 * authorisation that matters is the rate limiter, and the payload is bounded so
 * a report cannot become a log-flooding primitive.
 *
 * Always answers 204, whatever happened inside. A reporter that can be probed
 * for "was this stored?" tells an attacker which of their payloads got through,
 * and the browser has nothing useful to do with the answer anyway.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const limit = await strictRateLimiter.record(request);

  // A store outage is not abuse (same rule as /api/send-email): drop the report
  // rather than turn the reporter itself into an error.
  if (!limit.ok && !limit.unavailable) {
    return new NextResponse(null, { status: 204 });
  }

  const parsed = await readAndValidateBody(request, clientErrorBodySchema);

  if (parsed.success) {
    await recordClientError(parsed.data);
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
});
