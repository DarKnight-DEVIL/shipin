/**
 * ShipIN request middleware: rate limits, security headers, CORS, and cookie security.
 *
 * The in-memory limiter is best-effort only: limits are per runtime instance.
 * Use your hosting provider's WAF/edge controls for production-wide limits.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  webRateLimiter,
  apiRateLimiter,
  isRateLimited,
  addRateLimitHeaders,
} from "@/lib/rateLimiter";
import { SECURITY_HEADERS, getCSPWithNonce, getDevCSP, createSecureCookieHeader } from "@/lib/securityHeaders";
import { getCorsHeaders, isAllowedOrigin } from "@/lib/cors";
import { getCsrfTokenFromCookie } from "@/lib/csrf";

const SENSITIVE_PATHS = [
  "/api/paypal/",
  "/api/payment/",
  "/api/admin/",
  "/api/r2/",
  "/api/support/",
];

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const limiter = isApi ? apiRateLimiter : webRateLimiter;
  const limitResult = await limiter.record(request);

  if (isRateLimited(limitResult)) {
    const response = NextResponse.json(
      { error: "Too many requests, please try again later." },
      { status: 429 }
    );
    addRateLimitHeaders(response.headers, limitResult);
    return response;
  }

  // Reject cross-origin API requests from origins outside the allowlist.
  const origin = request.headers.get("origin");
  if (isApi && origin && !isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
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

  // Generate a unique nonce for this request.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const isDev = process.env.NODE_ENV === "development";
  const csp = isDev ? getDevCSP() : getCSPWithNonce(nonce);

  // Forward the nonce and CSP to Next.js so it can apply the nonce
  // to its framework and hydration scripts.
  const requestHeaders = new Headers(request.headers);
  if (!isDev) {
    requestHeaders.set("x-nonce", nonce);
  }
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

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

  return response;
}

export const config = {
  matcher: [
    "/((?!api/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
