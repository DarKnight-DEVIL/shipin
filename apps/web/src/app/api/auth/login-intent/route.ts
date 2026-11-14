import { NextResponse } from "next/server";

import { withErrorHandler } from "@/utils/errors";

import {
  loginRateLimiter,
  isRateLimited,
  addRateLimitHeaders,
} from "@/lib/rateLimiter";

/**
 * POST /api/auth/login-intent
 *
 * Pre-flight gate for sign-in attempts (Google popup and email/password).
 * Enforces an app-level limit (5 attempts per IP per minute) on top of
 * Firebase Auth's own built-in abuse protection.
 *
 * This endpoint intentionally does NO authentication — its only job
 * is to count and throttle anonymous sign-in attempts.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const result = await loginRateLimiter.record(request);

  // A missing shared store or a Redis outage is an infrastructure problem, not
  // an abusive client. Failing closed here took the whole sign-in flow offline
  // whenever the limiter backend was unavailable, so allow the attempt and log
  // it instead. Firebase Auth still applies its own abuse protection.
  if (isRateLimited(result) && result.unavailable) {
    console.warn(
      "[login-intent] rate-limit store unavailable; allowing sign-in attempt."
    );

    return NextResponse.json(
      { allowed: true, degraded: true },
      { status: 200 }
    );
  }

  if (isRateLimited(result)) {
    const response = NextResponse.json(
      {
        success: false,
        error: "Too many sign-in attempts. Please try again later.",
        code: "RATE_LIMIT_ERROR",
      },
      { status: 429 }
    );
    addRateLimitHeaders(response.headers, result);
    return response;
  }

  const response = NextResponse.json(
    {
      allowed: true,
      reset: Math.floor(result.reset / 1000),
    },
    { status: 200 }
  );
  addRateLimitHeaders(response.headers, result);

  return response;
});