/**
 * Per-request CSP nonces, for routes that are rendered on demand.
 *
 * Why this cannot simply apply everywhere: this app has 36 prerendered routes and
 * no dynamic ones. A prerendered page is built once, its HTML carries inline
 * bootstrap scripts, and a nonce generated per request can never match the copy
 * baked into that file - applying one would block exactly the scripts that hydrate
 * the page. That is the whole reason the policy has been nonce-free.
 *
 * So the decision is data-driven rather than assumed: `dynamicRoutes.generated.ts`
 * lists the app routes the build did NOT prerender, and only those get a nonce.
 * Today the list is empty and nothing changes; the day a route starts using
 * cookies() or headers() - or someone turns off static rendering - it moves into
 * the list on the next build and gets the tighter policy automatically.
 *
 * No `node:crypto` here: the proxy is compiled for the edge runtime as well, and a
 * Node import in that graph fails the production build. Web Crypto's
 * `getRandomValues` is present in both runtimes.
 */

import {
  DYNAMIC_APP_ROUTES,
  PRERENDERED_APP_ROUTES,
} from "@/config/dynamicRoutes.generated";

/** 16 random bytes, base64: CSP nonces are compared as strings, nothing more. */
export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

/**
 * Match a concrete path against one route pattern.
 *
 * Segment by segment, so `/requests/[id]` matches `/requests/abc` and
 * `/requests/abc/invoice`, but not `/requests` - that list page is prerendered and
 * must keep the nonce-free policy. A catch-all (`[...slug]`) matches the rest of
 * the path, including nothing at all for an optional catch-all.
 */
export function matchesRoutePattern(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  for (let index = 0; index < patternParts.length; index += 1) {
    const part = patternParts[index];

    const catchAll = part.match(/^\[\[?\.\.\.([^\]]+)\]?\]$/);
    if (catchAll) {
      const optional = part.startsWith("[[");
      const remaining = pathParts.length - index;

      return optional ? true : remaining >= 1;
    }

    if (index >= pathParts.length) return false;

    if (part.startsWith("[") && part.endsWith("]")) continue;

    if (part !== pathParts[index]) return false;
  }

  return patternParts.length === pathParts.length;
}

/**
 * True when this path is rendered per request, so a nonce can apply.
 *
 * A prerendered route wins over any pattern that would also match it. `/requests/[id]`
 * is dynamic, `/requests/new` satisfies that pattern, and `/requests/new` is a static
 * page with its own baked-in HTML - the router prefers the static route, so this
 * must too, or the page gets a nonce its own scripts do not carry.
 */
export function isDynamicallyRendered(pathname: string): boolean {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (PRERENDERED_APP_ROUTES.includes(normalized)) return false;

  return DYNAMIC_APP_ROUTES.some((route) =>
    matchesRoutePattern(route, normalized)
  );
}

/**
 * Rewrite a CSP so `script-src` trusts this request's nonce.
 *
 * `'unsafe-inline'` is dropped: browsers ignore it as soon as a nonce is present, so
 * leaving it in would make the policy read as if inline scripts were still allowed.
 * The third-party hosts are kept rather than replaced with `'strict-dynamic'` - that
 * directive discards the allowlist, and this app does load PayPal, reCAPTCHA and the
 * analytics script from those hosts, so nothing would be gained by refusing them.
 *
 * Inline scripts Next does not stamp (the next-themes pre-paint bootstrap) are
 * allowed by `'sha256-...'` hashes the build computed, because the alternative is
 * blocking them and repainting the page in the wrong theme.
 *
 * The attribute directive is untouched - `script-src-attr 'none'` stays the one rule
 * that does not depend on a nonce.
 */
export function applyNonceToCsp(
  csp: string,
  nonce: string,
  hashes: readonly string[]
): string {
  const match = csp.match(/script-src ([^;]+);/);
  if (!match) return csp;

  /*
   * The existing host list is kept. `'strict-dynamic'` would discard it, and this app
   * loads PayPal, reCAPTCHA and the Vercel analytics script from those hosts - the
   * nonce alone is what makes inline scripts acceptable, so nothing is gained by
   * making third-party tags collateral.
   *
   * `'unsafe-inline'` is removed: with a nonce or hash present browsers ignore it
   * anyway, and leaving it in would make the policy read as if inline scripts were
   * still allowed.
   */
  const sources = match[1]
    .split(/\s+/)
    .filter((source) => source && source !== "'unsafe-inline'");

  const withNonce = [
    ...sources,
    `'nonce-${nonce}'`,
    ...hashes.map((hash) => `'sha256-${hash}'`),
  ];

  return csp.replace(
    /script-src [^;]+;/,
    `script-src ${withNonce.join(" ")};`
  );
}
