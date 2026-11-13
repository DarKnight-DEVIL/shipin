/**
 * ShipIN request proxy (Next.js 16 file convention, formerly "middleware"): rate limits, security headers, CORS, and cookie security.
 *
 * Limits come from the shared Redis limiter when UPSTASH_REDIS_REST_* is set, so
 * they hold across serverless instances; without it production fails closed
 * (dev/test fall back to an in-memory limiter).
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  webRateLimiter,
  apiRateLimiter,
  isRateLimited,
  addRateLimitHeaders,
} from "@/lib/rateLimiter";
import { SECURITY_HEADERS, getProductionCSP, getDevCSP } from "@/lib/securityHeaders";
import { getCorsHeaders, isAllowedOrigin } from "@/lib/cors";
import { getCsrfTokenFromCookie } from "@/lib/csrf";

const SENSITIVE_PATHS = [
  "/api/paypal/",
  "/api/payment/",
  "/api/admin/",
  "/api/r2/",
  "/api/support/",
];

/**
 * Routes that bypass middleware entirely.
 *
 * `/api/webhook` needs its raw body for signature verification and is already
 * authenticated by the provider's signature, so it must not be rate limited
 * (a 429 would make the provider retry or drop the event).
 */
const BYPASS_PATHS = ["/api/webhook"];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (BYPASS_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const limiter = isApi ? apiRateLimiter : webRateLimiter;
  const limitResult = await limiter.record(request);

  if (isRateLimited(limitResult)) {
    const response = NextResponse.json(
      {
        success: false,
        error: "Too many requests, please try again later.",
        code: "RATE_LIMIT_ERROR",
      },
      { status: 429 }
    );
    addRateLimitHeaders(response.headers, limitResult);
    return response;
  }

  // Reject cross-origin API requests from origins outside the allowlist.
  const origin = request.headers.get("origin");
  if (isApi && origin && !isAllowedOrigin(origin)) {
    return NextResponse.json(
      {
        success: false,
        error: "Origin not allowed.",
        code: "CORS_ORIGIN_NOT_ALLOWED",
      },
      { status: 403 }
    );
  }

  // Preflight requests should not continue to application route handlers.
  if (isApi && request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (origin) {
      for (const [name, value] of Object.entries(getCorsHeaders(origin))) {
        response.headers.set(name, value);
      }
    }
    addRateLimitHeaders(response.headers, limitResult);
    return response;
  }

  const isDev = process.env.NODE_ENV === "development";
  const csp = isDev ? getDevCSP() : getProductionCSP();

  // No nonce is generated or forwarded: every page is statically prerendered,
  // so its inline bootstrap is already in the HTML before this runs and a
  // per-request nonce could never match it (see getProductionCSP).
  const response = NextResponse.next();

  addRateLimitHeaders(response.headers, limitResult);
  response.headers.set("Content-Security-Policy", csp);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name !== "Content-Security-Policy") response.headers.set(name, value);
  }

  // Add secure cookie headers for cookie-based flows
  // Only set if we're on a page that might need cookies (non-API)
  if (!isApi) {
    // CSRF token cookie for form submissions
    const csrfToken = getCsrfTokenFromCookie(request);
    if (!csrfToken) {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const newCsrfToken = btoa(String.fromCharCode(...array))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
      response.headers.append(
        "Set-Cookie",
        `csrf_token=${newCsrfToken}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400`
      );
    }
  }

  if (isApi && origin) {
    for (const [name, value] of Object.entries(getCorsHeaders(origin))) {
      response.headers.set(name, value);
    }
  }

  // Allow CSRF header in CORS
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-CSRF-Token"
  );

  if (process.env.NODE_ENV !== "development") {
    response.headers.set("X-Debug-Mode", "disabled");
  }

  if (
    !request.headers.has("authorization") &&
    SENSITIVE_PATHS.some((path) => pathname.startsWith(path))
  ) {
    // Informational only. Actual authorization must be enforced by each route.
    response.headers.set("X-Sensitive-Route", "true");
  }

  // Public landing + track pages should be indexable by search engines.
  // Authenticated/app pages keep the default noindex from SECURITY_HEADERS.
  const PUBLIC_ROUTES = ["/", "/track"];
  if (PUBLIC_ROUTES.includes(pathname)) {
    response.headers.set("X-Robots-Tag", "index, follow");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
