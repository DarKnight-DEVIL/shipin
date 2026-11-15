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
 * Every API route in this app is same-origin and authenticated, so there
 * is no allowlist of "public" routes here: cross-origin access is decided
 * solely by the origin check, and authorization is enforced per route.
 */

/**
 * Frontend origins this deployment answers for by default.
 *
 * Firebase Hosting serves the same app from the project's default domains
 * (`*.web.app` and `*.firebaseapp.com`), so they are listed explicitly
 * rather than relying on a wildcard. Further deployments can be added at
 * runtime with APP_ALLOWED_ORIGINS instead of editing this list.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://shipin-psi.vercel.app", // Vercel
  "https://shipin-9576a.web.app", // Firebase Hosting (default domain)
  "https://shipin-9576a.firebaseapp.com", // Firebase Hosting (alternate domain)
  "http://localhost:3000", // Local development
  "http://127.0.0.1:3000", // Local development (loopback alias)
];

/** Parse a comma-separated origin list from the environment. */
function parseOriginList(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((origin) => origin.trim().toLowerCase().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);
}

/**
 * Origins belonging to the Vercel deployment this process is running on.
 *
 * Preview deployments get a generated hostname (`shipin-psi-<hash>-<team>.vercel.app`)
 * that cannot be known ahead of time, so a preview build's own pages were
 * rejected by the origin check: the browser sends `Origin` even on same-origin
 * POSTs, and sign-in failed with CORS_ORIGIN_NOT_ALLOWED.
 *
 * Vercel injects these hosts as system environment variables, so the exact
 * deployment origin is derived instead of guessed. Wildcarding `*.vercel.app`
 * would also accept every unrelated project hosted there, which is not needed
 * to fix preview sign-in.
 */
function vercelDeploymentOrigins(): string[] {
  const hosts = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ];

  return hosts
    .filter((host): host is string => Boolean(host))
    .map((host) =>
      /^https?:\/\//i.test(host) ? host : `https://${host}`
    )
    .map((origin) => origin.toLowerCase().trim().replace(/\/+$/, ""));
}

/**
 * Resolve the allowed origins for this runtime.
 *
 * Computed per call rather than cached at module load so environment
 * configuration is honoured in tests and in long-lived server processes.
 */
function allowedOrigins(): string[] {
  return Array.from(
    new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      ...vercelDeploymentOrigins(),
      ...parseOriginList(process.env.APP_ALLOWED_ORIGINS),
    ])
  );
}

/**
 * Loopback origin on any port, e.g. `next dev` falling back to an ephemeral
 * port when 3000 is already taken.
 */
function isLoopbackOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);
}

/**
 * Check whether an origin is allowed.
 *
 * Note: Next.js renders on the server, so `request.headers.get("origin")`
 * is available. In a CSR-only client file, use the environment's
 * `window.origin` if needed.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const normalized = origin.toLowerCase().trim().replace(/\/+$/, "");

  // Local development is same-origin regardless of port. Pinning this to :3000
  // meant that whenever `next dev` picked another port, every API call from the
  // page was answered with 403 CORS_ORIGIN_NOT_ALLOWED — which surfaced as
  // "Unable to sign in" because profile creation runs through /api/profile.
  // Loopback cannot be reached by a remote attacker, so this is dev-only.
  if (process.env.NODE_ENV !== "production" && isLoopbackOrigin(normalized)) {
    return true;
  }

  return allowedOrigins().some((allowed) => {
    const candidate = allowed.toLowerCase().trim().replace(/\/+$/, "");
    // Exact match
    if (candidate === normalized) return true;
    // Explicit subdomain wildcard only: https://*.example.com
    if (candidate.startsWith("https://*.")) {
      const base = candidate.slice("https://*.".length);
      return (
        normalized.startsWith("https://") &&
        normalized.endsWith("." + base)
      );
    }
    return false;
  });
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
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
  headers["Access-Control-Allow-Headers"] =
    "Content-Type, Authorization, X-Requested-With, X-Firebase-AppCheck";
  headers["Access-Control-Max-Age"] = "86400";
  headers["Vary"] = "Origin";

  return headers;
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