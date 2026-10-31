import { NextResponse } from "next/server";

import {
  loginRateLimiter,
  isRateLimited,
  addRateLimitHeaders,
} from "@/lib/rateLimiter";

/**
 * POST /api/auth/login-intent
 *
 * Pre-flight gate for Google sign-in.
 *
 * The browser client MUST call this endpoint before opening the
 * Google OAuth popup. It enforces an app-level limit (5 sign-in
 * attempts per IP per minute) on top of Firebase Auth's own
 * built-in abuse protection.
 *
 * This endpoint intentionally does NO authentication — its only
 * job is to count and throttle anonymous sign-in attempts.
 */
export async function POST(request: Request) {
  const result = await loginRateLimiter.record(request);

  const response = NextResponse.json(
    {
      allowed: result.ok,
      reset: Math.floor(result.reset / 1000),
    },
    { status: result.ok ? 200 : 429 }
  );

  addRateLimitHeaders(response.headers, result);

  return response;
}