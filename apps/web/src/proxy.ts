/**
 * ShipIN request proxy (Next.js 16 file convention, formerly "middleware"): rate limits, security headers, CORS, and cookie security.
 *
 * Limits come from the shared Redis limiter when UPSTASH_REDIS_REST_* is set, so
 * they hold across serverless instances. A production build without a store
 * refuses to start (validateProductionRequiredEnv), and a configured store that
 * becomes unreachable at runtime falls open with /api/health reporting
 * `degraded` — an outage must not lock everyone out.
 */
import { childLogger } from "@/lib/logger";
import { NextResponse, type NextRequest } from "next/server";
import {
  webRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  authEntryRateLimiter,
  isRateLimited,
  addRateLimitHeaders,
} from "@/lib/rateLimiter";
import {
  SECURITY_HEADERS,
  getAuthHelperCSP,
  getProductionCSP,
  getDevCSP,
} from "@/lib/securityHeaders";
import { getCorsHeaders, isAllowedOrigin } from "@/lib/cors";
import { classifyRoute } from "@/config/routeAuth";
import { isIndexableRoute } from "@/config/seo";
import { isInsecureRequest, isLoopbackHost } from "@/lib/https";

// The classification table lives in `@/config/routeAuth` so the Node-only
// startup validator (src/config/routeClassification.ts) can enumerate every
// route under src/app/api and compare it against the same table this bundle
// enforces per request. An unclassified route answers 500 here at runtime, so
// that validator throws at boot instead of shipping the gap.

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

/** Methods that can change server state, so a cross-site initiator is refused. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export default async function proxy(request: NextRequest) {
  // Generate a correlation ID for this request and propagate it everywhere.
  // This enables distributed tracing across API routes, PayPal webhooks,
  // Firestore writes, Sentry events, and any downstream service.
  // Use crypto.randomUUID() available in Node.js 14+ (project targets Node 24).
  const requestId =
    crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  const correlationLogger = childLogger({ service: "proxy", requestId });

  const { pathname } = request.nextUrl;

  // Enforce HTTPS before anything else: an insecure request gets one 308 to the
  // same path over TLS. Vercel already does this at the edge, so this only
  // fires for a host that terminates TLS in front of the app. Development is
  // untouched (no forwarded header, and loopback has no TLS at all).
  if (
    process.env.NODE_ENV === "production" &&
    isInsecureRequest(request.headers.get("x-forwarded-proto")) &&
    !isLoopbackHost(request.nextUrl.hostname)
  ) {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = "https:";
    const redirect = NextResponse.redirect(httpsUrl, 308);
    redirect.headers.set("Strict-Transport-Security", SECURITY_HEADERS["Strict-Transport-Security"]);
    redirect.headers.set("X-Request-Id", requestId);
    return redirect;
  }

  const isApi = pathname.startsWith("/api/");
  const limiter = isApi
    ? apiRateLimiter
    : isAuthEntryPath(pathname)
      ? authEntryRateLimiter
      : webRateLimiter;

  // Override with strict rate limiter for /api/tracking to make guessing
  // sequential SHP-YYYY-NNNNNN IDs expensive while allowing customer retries.
  const trackingPaths = ["/api/tracking", "/api/tracking/"];
  const isTrackingPath = trackingPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const actualLimiter = isTrackingPath ? strictRateLimiter : limiter;

  const limitResult = await actualLimiter.record(request);

  // A rejection caused by a missing/unreachable shared store is an
  // infrastructure problem, not an abusive client. Serve the request.
  // Nothing is logged here on purpose: with no store configured this is every
  // request (the E2E suite alone produced 111 of these), and with a store that
  // is down the limiter's own error counter, the startup warning and
  // /api/health already carry the signal.
  if (isRateLimited(limitResult) && !limitResult.unavailable) {
    const response = NextResponse.json(
      {
        success: false,
        error: "Too many requests, please try again later.",
        code: "RATE_LIMIT_ERROR",
        requestId,
      },
      { status: 429 }
    );
    addRateLimitHeaders(response.headers, limitResult);
    response.headers.set("X-Request-Id", requestId);
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
    response.headers.set("X-Request-Id", requestId);
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
        requestId,
      },
      { status: 403 }
    );
  }

  // Reject a cross-origin mutation even when its Origin is allowlisted.
  // The allowlist above answers the CORS question ("may this origin call us?").
  // `Sec-Fetch-Site` answers a different one — "did another site initiate
  // this?" — and the browser sets it itself, so page script cannot forge it.
  // It closes the gap the allowlist leaves: a plain form post or a `no-cors`
  // fetch is exactly the shape of a CSRF request, and it may carry no Origin
  // the allowlist can judge at all. Only mutations are refused, because a
  // cross-site read has no session-changing effect.
  if (
    isApi &&
    MUTATING_METHODS.has(request.method) &&
    request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Cross-site request blocked.",
        code: "CROSS_SITE_REQUEST_BLOCKED",
        requestId,
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
        console.error(
          `[proxy] UNCLASSIFIED ROUTE: ${pathname} — rejecting request. Add to ROUTE_AUTH_CLASSIFICATION.`
        );
        return NextResponse.json(
          {
            success: false,
            error: "Route not configured.",
            code: "ROUTE_UNCLASSIFIED",
          },
          { status: 500 }
        );
      } else {
        // In dev/test, warn but allow (for easier development).
        correlationLogger.warn(`[proxy] Unclassified route (dev): ${pathname}`);
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
  // The proxied Firebase auth helper is embedded in the app's own pages, so
  // it must be frameable same-origin (see getAuthHelperCSP).
  const isAuthHelper = pathname.startsWith("/__/auth/");
  const csp = isAuthHelper
    ? getAuthHelperCSP()
    : isDev
      ? getDevCSP()
      : getProductionCSP();

  // No nonce is generated or forwarded: every page is statically prerendered,
  // so its inline bootstrap is already in the HTML before this runs and a
  // per-request nonce could never match it (see getProductionCSP).
  const response = NextResponse.next();

  addRateLimitHeaders(response.headers, limitResult);
  response.headers.set("Content-Security-Policy", csp);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name === "Content-Security-Policy") continue;
    if (isAuthHelper && name === "X-Frame-Options") {
      // Same exception as the CSP above: the auth helper iframe is embedded
      // by this app's own pages, so DENY would break every sign-in.
      response.headers.set(name, "SAMEORIGIN");
      continue;
    }
    response.headers.set(name, value);
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

  // Only public marketing/legal pages are indexable; every signed-in page
  // keeps the default noindex from SECURITY_HEADERS. The list lives in
  // config/seo.ts so the sitemap cannot advertise a URL this header marks
  // noindex (the mismatch Search Console reports as "Excluded by noindex tag").
  if (isIndexableRoute(pathname)) {
    response.headers.set("X-Robots-Tag", "index, follow");
  }

  // Propagate the correlation ID to the response so downstream services and
  // the browser can echo it back in subsequent requests.
  response.headers.set("X-Request-Id", requestId);

  return response;
}

export const config = {
  // `/api/webhook` is excluded: signature verification needs the raw body and
  // the provider signature is its authentication. The proxy never sees it,
  // so this route meters itself (`apiRateLimiter`, plus a cheap signature-
  // header gate) before it spends a PayPal verification call — see
  // src/app/api/webhook/route.ts.
  matcher: ["/((?!api/webhook|_next/static|_next/image|favicon.ico|\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};