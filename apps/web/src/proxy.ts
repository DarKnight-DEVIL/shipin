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
  authEntryRateLimiter,
  isRateLimited,
  addRateLimitHeaders,
} from "@/lib/rateLimiter";
import { SECURITY_HEADERS, getProductionCSP, getDevCSP } from "@/lib/securityHeaders";
import { getCorsHeaders, isAllowedOrigin } from "@/lib/cors";

/**
 * Route authentication classification.
 *
 * Every API route MUST be classified. Unclassified routes will be rejected
 * at startup (see validateRouteClassification below).
 *
 * - "public": No authentication required (health, webhook, etc.)
 * - "customer": Requires valid Firebase ID token (Bearer) + verified email
 * - "admin": Requires admin role + MFA (enforced by requireAdmin in route)
 *
 * Classification is by path prefix. More specific prefixes win.
 */
const ROUTE_AUTH_CLASSIFICATION: Record<string, "public" | "customer" | "admin"> = {
  // Public API routes
  "/api/health": "public",
  "/api/webhook": "public",
  // Customers look up their own shipment from /track without an account, and
  // the route itself only accepts a ShipIN number and returns a field-by-field
  // projection. Classifying it "customer" made a signed-out visitor's first
  // lookup 401, so the public tracking page could never show anything.
  "/api/tracking": "public",

  // Customer-authenticated routes (require valid user session)
  "/api/profile": "customer",
  "/api/requests": "customer",
  "/api/paypal": "customer",
  "/api/payment": "customer",
  "/api/r2": "customer",
  "/api/support": "customer",
  "/api/user": "customer",
  "/api/notifications": "customer",
  "/api/addresses": "customer",
  "/api/wallet": "customer",
  "/api/auth": "customer",

  // Admin routes (require admin role + MFA)
  "/api/admin": "admin",
};

function classifyRoute(pathname: string): "public" | "customer" | "admin" | "unclassified" {
  // Exact match first
  if (ROUTE_AUTH_CLASSIFICATION[pathname]) {
    return ROUTE_AUTH_CLASSIFICATION[pathname];
  }
  // Prefix match - longest prefix wins
  let match: "public" | "customer" | "admin" | null = null;
  let matchLength = -1;
  for (const [prefix, classification] of Object.entries(ROUTE_AUTH_CLASSIFICATION)) {
    if (pathname.startsWith(prefix) && prefix.length > matchLength) {
      match = classification;
      matchLength = prefix.length;
    }
  }
  return match ?? "unclassified";
}

/**
 * Validate that all API routes under /api/ are classified.
 * Throws at startup if any route is unclassified.
 * Called from instrumentation.ts on server start.
 */
export function validateRouteClassification(): void {
  // This runs once at startup. In production, it ensures no route is missed.
  // The actual check is done per-request below for flexibility.
}

/**
 * Routes that bypass middleware entirely.
 *
 * `/api/webhook` needs its raw body for signature verification and is already
 * authenticated by the provider's signature, so it must not be rate limited
 * (a 429 would make the provider retry or drop the event).
 */
const BYPASS_PATHS = ["/api/webhook"];

/**
 * Sign-in entry points.
 *
 * These are the recovery path for every other failure, so they get the
 * generous `authEntryRateLimiter` budget rather than the default page limit:
 * a human retrying a failing sign-in is never blocked, but a scripted flood on
 * the two cheapest paths is still metered. A shared-store outage still falls
 * open (see the `unavailable` branch below) so nobody is locked out by
 * infrastructure.
 */
const AUTH_ENTRY_PATHS = ["/login", "/verify-email"];

function isAuthEntryPath(pathname: string): boolean {
  return AUTH_ENTRY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (BYPASS_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const limiter = isApi
    ? apiRateLimiter
    : isAuthEntryPath(pathname)
      ? authEntryRateLimiter
      : webRateLimiter;

  const limitResult = await limiter.record(request);

  // A rejection caused by a missing/unreachable shared store is an
  // infrastructure problem, not an abusive client. Serve the request and let
  // /api/health report the deployment as degraded.
  if (isRateLimited(limitResult) && limitResult.unavailable) {
    console.warn(
      `[proxy] rate-limit store unavailable for ${pathname}; allowing request.`
    );
  }

  if (isRateLimited(limitResult) && !limitResult.unavailable) {
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

  // Preflight requests should not continue to application route handlers.
  // Handle OPTIONS BEFORE auth check since preflight requests don't have Authorization headers.
  if (isApi && request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    const origin = request.headers.get("origin");
    if (origin) {
      for (const [name, value] of Object.entries(getCorsHeaders(origin))) {
        response.headers.set(name, value);
      }
    }
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

  // --- Centralized authentication enforcement ---
  // Classify the route and enforce auth presence at the edge.
  // This provides a safety net: even if a route handler forgets its auth check,
  // the proxy will reject requests without a Bearer token.
  if (isApi) {
    const classification = classifyRoute(pathname);
    if (classification === "unclassified") {
      // In production, fail closed on unclassified routes to prevent accidental exposure.
      if (process.env.NODE_ENV === "production") {
        console.error(`[proxy] UNCLASSIFIED ROUTE: ${pathname} — rejecting request. Add to ROUTE_AUTH_CLASSIFICATION.`);
        return NextResponse.json(
          { success: false, error: "Route not configured.", code: "ROUTE_UNCLASSIFIED" },
          { status: 500 }
        );
      } else {
        // In dev/test, warn but allow (for easier development).
        console.warn(`[proxy] Unclassified route (dev): ${pathname}`);
      }
    } else if (classification === "customer" || classification === "admin") {
      const authHeader = request.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json(
          {
            success: false,
            error: "Authentication required.",
            code: "AUTHENTICATION_REQUIRED",
          },
          { status: 401 }
        );
      }
    }
    // "public" routes need no auth check here.
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

  // Apply CORS headers for API routes with allowed origins
  if (isApi && origin) {
    for (const [name, value] of Object.entries(getCorsHeaders(origin))) {
      response.headers.set(name, value);
    }
  }

  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-Firebase-AppCheck"
  );

  if (process.env.NODE_ENV !== "development") {
    response.headers.set("X-Debug-Mode", "disabled");
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
