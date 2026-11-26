/**
 * GENERATED FILE - do not edit.
 *
 * App routes the build did not prerender, from `scripts/generate-dynamic-routes.mjs`
 * (wired into `build`). Only these may receive a per-request CSP nonce: a
 * prerendered page has its inline scripts baked in, so a nonce generated when its
 * HTML is served could never match them.
 *
 * Empty means every route is prerendered - the correct state for this app today,
 * not a missing mechanism. When a page starts using cookies()/headers(), or is
 * marked `force-dynamic`, it appears here on the next build and gets the tighter
 * policy automatically.
 */
export const DYNAMIC_APP_ROUTES: readonly string[] = [
  "/admin/requests/[requestId]",
  "/payment/[id]",
  "/requests/[id]",
  "/requests/[id]/invoice",
  "/shipment/[id]",
  "/track/[trackingId]"
];

/**
 * Routes with prerendered HTML of their own. An exact match here always wins over a
 * dynamic pattern: `/requests/new` is a static page even though `/requests/[id]`
 * would also match it.
 */
export const PRERENDERED_APP_ROUTES: readonly string[] = [
  "/",
  "/addresses",
  "/admin",
  "/admin/audit",
  "/admin/dashboard",
  "/admin/purchasing",
  "/admin/requests",
  "/admin/security",
  "/admin/support",
  "/admin/users",
  "/admin/wallet",
  "/admin/warehouse",
  "/admin/warehouse-inventory",
  "/cookie-policy",
  "/dashboard",
  "/favicon.ico",
  "/licences",
  "/llms.txt",
  "/login",
  "/notifications",
  "/privacy-policy",
  "/refund-policy",
  "/requests",
  "/requests/new",
  "/robots.txt",
  "/settings",
  "/sitemap.xml",
  "/support",
  "/terms",
  "/thank-you",
  "/track",
  "/verify-email",
  "/wallet",
  "/wallet/topup"
];

/**
 * `sha256-` hashes of inline scripts shared by every prerendered page (the theme
 * bootstrap). Each is an allowance that survives dropping `'unsafe-inline'`, for
 * scripts Next does not stamp with the request nonce.
 */
export const SHARED_INLINE_SCRIPT_HASHES: readonly string[] = [
  "7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs=",
  "OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo=",
  "QAlSewaQLi/NPCznjAZSyvQ72heD0VdxmNDDkZeCxgc=",
  "p7GE78bbMHDrE4IWzpiMSttAsTpUu7wwi5/wvnH54Os=",
  "zjP2BXYgSCCnXNMXI2IL1yRydoQdsGR/uCCr6kyKsD0="
];
