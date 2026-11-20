/**
 * Route authentication classification.
 *
 * Every API route must be classified, because the proxy enforces auth at the
 * edge as a safety net for handlers that forget their own check. Kept in its own
 * module with no Node built-ins: the proxy bundle is edge-safe, while the
 * startup validator (which enumerates `src/app/api/**\/route.ts` from disk) is
 * Node-only and imports this table.
 *
 * - "public":   no authentication (health, webhook, anonymous sign-in helpers)
 * - "customer": valid Firebase ID token (Bearer) + verified email
 * - "admin":    admin role + MFA (enforced by requireAdmin in the route)
 *
 * Matching is by path: an exact entry wins, otherwise the longest prefix.
 */
export type RouteAuth = "public" | "customer" | "admin";

export const ROUTE_AUTH_CLASSIFICATION: Record<string, RouteAuth> = {
  // --- Public ---
  "/api/health": "public",
  "/api/webhook": "public",
  // Customers look up their own shipment from /track without an account, and
  // the route itself only accepts a ShipIN number and returns a field-by-field
  // projection. Classifying it "customer" made a signed-out visitor's first
  // lookup 401, so the public tracking page could never show anything.
  "/api/tracking": "public",
  // CSP violation reports arrive from the browser before any session exists,
  // and browsers drop the `Authorization` header on `report-uri` posts. This
  // endpoint is a bounded-body logger; classifying it "customer" made every
  // report a 401 and silently disabled CSP monitoring in production.
  "/api/csp-report": "public",
  // Sign-in entry points. These are pre-authentication by definition: the whole
  // point of login-intent is to meter anonymous attempts, and the password leak
  // check only ever sees a 5-char SHA-1 prefix. Classifying the /api/auth
  // prefix "customer" made every sign-in 401 before the user could submit
  // credentials. The MFA routes below still need a session, and the exact-match
  // entries here take precedence over that prefix.
  "/api/auth/login-intent": "public",
  "/api/auth/password-leak-check": "public",
  // The hourly quote sweep authenticates itself: a timestamp plus an HMAC of it
  // signed with CRON_SECRET (see the route). GitHub Actions calls it with no
  // Firebase session, so under the "/api/admin" prefix the proxy answered every
  // run with 401 AUTHENTICATION_REQUIRED before the handler could check the
  // signature — the cron had never expired a single quote. The handler still
  // refuses a caller that cannot produce a valid signature, and the proxy keeps
  // rate-limiting it. An exact entry, so the admin prefix still covers every
  // other route below it.
  "/api/admin/requests/quotes/expire": "public",

  // --- Customer ---
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
  // Every route currently under this prefix authenticates with a Firebase ID
  // token: the MFA routes call `requireAuthWithProfile` (or verify the Bearer
  // token themselves), so "customer" is the correct default and fails closed.
  // A new PRE-authentication route (sign-in, reset) must be added as an exact
  // "public" entry above; it must not rely on this prefix.
  "/api/auth": "customer",

  // --- Admin ---
  "/api/admin": "admin",
  // Privileged operator surfaces. Each handler already calls requireAdmin; the
  // proxy used to treat them as unknown, which in production meant every
  // request was rejected with a 500 ROUTE_UNCLASSIFIED (or, for /api/compliance,
  // an unclassified warning) instead of a clean 401/403 from the handler.
  "/api/send-email": "admin",
  "/api/whatsapp": "admin",
  "/api/compliance": "admin",
};

export type RouteClassification = RouteAuth | "unclassified";

/**
 * Entries that classify exactly one path and must not cover its children.
 *
 * Matching below is prefix-based, which is what lets `/api/admin` cover every
 * route under it. An exception carved out of a protected prefix has the
 * opposite requirement: a future `/api/admin/requests/quotes/expire/something`
 * must not inherit the cron route's "public" by accident. Keep every such
 * exception in this set, so the carve-out cannot leak.
 */
const EXACT_ONLY: ReadonlySet<string> = new Set([
  "/api/admin/requests/quotes/expire",
]);

export function classifyRoute(pathname: string): RouteClassification {
  const exact = ROUTE_AUTH_CLASSIFICATION[pathname];
  if (exact) return exact;

  let match: RouteAuth | null = null;
  let matchLength = -1;
  for (const [prefix, classification] of Object.entries(
    ROUTE_AUTH_CLASSIFICATION
  )) {
    if (EXACT_ONLY.has(prefix)) continue;
    if (pathname.startsWith(prefix) && prefix.length > matchLength) {
      match = classification;
      matchLength = prefix.length;
    }
  }
  return match ?? "unclassified";
}
