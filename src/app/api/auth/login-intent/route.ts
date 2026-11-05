import { NextResponse } from "next/server";

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
export async function POST(request: Request) {
  const result = await loginRateLimiter.record(request);

  if (isRateLimited(result)) {
    const response = NextResponse.json(
      { error: "Too many sign-in attempts. Please try again later." },
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
}