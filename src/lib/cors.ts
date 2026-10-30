/**
 * CORS configuration for ShipIN.
 *
 * Next.js API routes do not use Express, so `cors` package is not
 * applicable. Instead, this module provides:
 *
 *   1. getServerSideCorsHeaders — headers for Server-Side Rendering
 *      pages (layout.tsx, page.tsx) using the `headers()` Next.js API.
 *   2. getCorsHeaders — headers for API route handlers that can't use
 *      the `headers()` export (e.g. when computing in the handler).
 *   3. isAllowedOrigin — helper to validate origins.
 *
 * For serverless (Vercel), set CORS at the platform level via
 * vercel.json "headers" for full control.
 */

// Production-allowed frontend origins.
// Add deployment domains here. Keep this list short and explicit.
const ALLOWED_ORIGINS = [
  "https://shipin.com",
  "https://www.shipin.com",
  "http://localhost:3000",
];

// APIs that do NOT require an authenticated token, but still need CORS.
const PUBLIC_API_ROUTES = ["/api/tracking/", "/api/whatsapp/test/"];

/**
 * Check whether an origin is allowed.
 *
 * Note: Next.js renders on the server, so `request.headers.get("origin")`
 * is available. In a CSR-only client file, use the environment's
 * `window.origin` if needed.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const normalized = origin.toLowerCase().trim();
  return ALLOWED_ORIGINS.some(
    (allowed) =>
      allowed === normalized ||
      allowed.endsWith("/*") ||
      allowed.endsWith("*") ||
      (allowed.startsWith("*") &&
        normalized.endsWith(allowed.slice(1)))
  );
}

/**
 * Build CORS headers for an incoming request.
 *
 * - Credentials must be included for cookie/XHR auth flows, which
 *   requires an explicit origin (never "*").
 * - Only the requested methods and headers are exposed.
 */
export function getCorsHeaders(requestOrigin: string | null) {
  const headers: Record<string, string> = {};

  if (requestOrigin && isAllowedOrigin(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  headers["Access-Control-Allow-Credentials"] = "true";
  headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
  headers["Access-Control-Allow-Headers"] =
    "Content-Type, Authorization, X-Requested-With, X-CSRF-Token";
  headers["Access-Control-Max-Age"] = "86400";
  headers["Vary"] = "Origin";

  return headers;
}

/**
 * Check whether a route should allow public (unauthenticated) CORS.
 *
 * These routes are intentionally open to any origin for the public
 * features of the platform.
 */
export function isPublicApiRoute(path: string): boolean {
  return PUBLIC_API_ROUTES.some((route) => path.startsWith(route));
}

/**
 * Build headers for SSR pages.
 *
 * These headers (CORS + security) are returned via Next.js `headers()`
 * in the layout/page. Keep `Access-Control-Allow-Origin` permissive
 * for public landing pages and tighten it per-page where needed.
 */
export function getServerSideCorsHeaders(origin: string | null) {
  const headers = getCorsHeaders(origin);

  // Security headers must also be set on SSR pages.
  headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  headers["X-Frame-Options"] = "DENY";
  headers["X-Content-Type-Options"] = "nosniff";
  headers["Permissions-Policy"] =
    "accelerometer=(), camera=(), gyroscope=(), magnetometer=(), microphone=(), " +
    "payment=(self), publickey-credentials-get=(), usb=(), geolocation=(), " +
    "clipboard-read=(), clipboard-write=(), speaker=(), display-capture=(), " +
    "document-domain=(), cross-origin-isolated=()";

  return headers;
}