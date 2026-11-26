/**
 * Security Headers configuration for ShipIN.
 *
 * This module provides a comprehensive, defense-in-depth set of HTTP
 * response headers. All values are conservative and production-ready.
 *
 * Content Security Policy (CSP):
 *   - Default to 'self'; no 'unsafe-eval' in either environment.
 *   - 'unsafe-inline' IS allowed for scripts and styles. Every route is
 *     statically prerendered, so Next.js writes the hydration bootstrap into
 *     the HTML at build time and a per-request nonce could never match it — the
 *     comment on getProductionCSP below has the full reasoning.
 *   - Inline event-handler attributes are blocked (`script-src-attr 'none'`).
 *     That is the sink `'unsafe-inline'` would otherwise re-open: React never
 *     emits `onclick="…"`, so nothing legitimate breaks while an injected
 *     attribute can no longer run script.
 *   - Restrict image sources, fonts, frames, and connect targets. Production
 *     names image hosts instead of carrying a blanket `https:`.
 *   - CSP violation reports are sent to /api/csp-report via report-to.
 *
 * NOTE: If your app legitimately uses inline scripts or third-party
 * services (Google Analytics, PayPal, Spline), add their sources to the
 * appropriate CSP directives here.
 */

import { isProduction } from "@/config/env";

/**
 * Loopback origins for the local Firebase emulators, or an empty string.
 *
 * `connect-src` has no http source, so a local E2E build could not reach
 * 127.0.0.1:9099 and sign-in failed with `auth/network-request-failed` while
 * the CSP error was the only clue. These hosts are empty in every deployment
 * build (the NEXT_PUBLIC_* values are inlined at build time), so this cannot
 * widen a real deployment's policy.
 */
function emulatorConnectSources(): string {
  const origins = [
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
    process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((host) => `http://${host}`);

  return origins.length > 0 ? ` ${[...new Set(origins)].join(" ")}` : "";
}

/**
 * Hosts the development policy may load images from.
 *
 * This list replaces a bare `https:`, which let *any* HTTPS host serve an
 * image — and an image request carries the page URL in `Referer`, so the
 * blanket was also an outbound channel to anywhere. Every entry is a host the
 * app really renders:
 *
 *   - `*.r2.cloudflarestorage.com` — presigned packing/inspection photos
 *     (`src/lib/r2.ts` builds the endpoint from `R2_ACCOUNT_ID`, so this is the
 *     only shape those URLs take)
 *   - `lh3.googleusercontent.com` — Google profile photos, the only
 *     `next/image` remotePattern in `next.config.ts`
 *   - `www.gstatic.com` — Google font and identity assets
 *   - `www.paypalobjects.com` — the PayPal SDK renders its logo from here on
 *     `/wallet/topup`, which the narrowed list missed
 */
const IMAGE_SOURCES = [
  "'self'",
  "blob:",
  "data:",
  "https://*.r2.cloudflarestorage.com",
  "https://lh3.googleusercontent.com",
  "https://www.gstatic.com",
  "https://www.paypalobjects.com",
].join(" ");

/**
 * Local sockets for the dev server's own HMR channel.
 *
 * Turbopack keeps its HMR channel on a WebSocket at the dev server origin, and
 * `'self'` only covers http(s) sources. The port is wildcarded because it is
 * chosen at runtime (`PORT`, or 3001 when 3000 is taken); the host is not, so
 * this stays a loopback-only allowance. Serving dev to another device over a
 * LAN IP is the one case it does not cover — fast refresh goes quiet there, but
 * the app still loads, which is a better trade than `ws:` anywhere.
 */
const DEV_HMR_SOCKETS =
  "ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*";

/**
 * Development CSP: allows inline scripts and styles for Turbopack/Next.js dev server.
 * This is less secure but necessary for development hot-reloading.
 *
 * Only the two allowances dev genuinely needs over production are wider here:
 * `'unsafe-eval'`/`'wasm-unsafe-eval'` for the dev bundle, and loopback HMR
 * sockets. `img-src` and `connect-src` otherwise name explicit hosts instead of
 * carrying a blanket `https:`/`wss:`.
 */
export function getDevCSP(): string {
  const base =
    "'self' https://www.gstatic.com https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://unpkg.com https://apis.google.com https://accounts.google.com https://va.vercel-scripts.com https://www.google.com/recaptcha/";
  const scriptSrc = `script-src ${base} 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; script-src-attr 'none'; `;

  return (
    "default-src 'self'; " +
    scriptSrc +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.paypal.com https://www.paypal.com; " +
    `img-src ${IMAGE_SOURCES}; ` +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' https://api-m.sandbox.paypal.com https://api-m.paypal.com " +
    // The PayPal SDK itself posts to its own origin (`/xoplatform/logger/...`),
    // not just the `api-m` hosts. Without these the SDK logs CSP refusals on
    // every render of the top-up button.
    "https://www.paypal.com https://www.sandbox.paypal.com " +
    "https://graph.facebook.com https://www.google.com https://www.google.com/recaptcha/ https://www.googletagmanager.com " +
    "https://*.googleapis.com https://firestore.googleapis.com https://firebase.googleapis.com " +
    "https://fonts.googleapis.com https://cdn.vercel-insights.com https://analytics.vercel.com https://va.vercel-scripts.com " +
    // Firebase Realtime Database sockets, then the dev-only transports: HMR on
    // loopback and the local emulator origins.
    "wss://*.firebaseio.com wss://*.firebasedatabase.app " +
    DEV_HMR_SOCKETS +
    emulatorConnectSources() +
    "; " +
    "worker-src 'self' blob:; " +
    "media-src 'self'; " +
    "frame-src 'self' https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://accounts.google.com https://apis.google.com https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
    "report-to 'csp-endpoint'; " +
    "report-uri /api/csp-report; " +
    "upgrade-insecure-requests"
  );
}

/**
 * Production-ready Security Headers map.
 *
 * Each header is explained in the accompanying SECURITY_AUDIT.md report.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  /**
   * Referrer Policy
   * Prevents referrer leakage to third parties.
   */
  "Referrer-Policy": "strict-origin-when-cross-origin",

  /**
   * Blocks the site from being embedded in an iframe.
   * Mitigates clickjacking.
   */
  "X-Frame-Options": "DENY",

  /**
   * Forces the browser to always use HTTPS.
   * (Effective when set via Vercel/CDN; on Netlify use _headers.)
   */
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",

  /**
   * Prevents MIME-type sniffing.
   */
  "X-Content-Type-Options": "nosniff",

  /**
   * XSS filter in legacy browsers.
   *
   * `0` disables the reflected-XSS auditor on purpose: OWASP and every major
   * browser vendor recommend it, because the auditor itself could be steered
   * into injecting script into a page (and it was removed from modern
   * Chromium/Edge/Safari entirely). Leaving the header out is not the safer
   * choice — old IE/Edge then enable the auditor by default. Real XSS defence
   * here is the CSP above plus output encoding, not this header.
   */
  "X-XSS-Protection": "0",

  /**
   * Remove application-level disclosure header.
   * Next.js already handles this via poweredByHeader: false in next.config.ts
   */
  // "X-Powered-By": "ShipIN",  // Removed — handled by next.config.ts

  /**
   * Content Security Policy.
   *
   * In production, use getProductionCSP(). In development, use the
   * permissive CSP from getDevCSP(). This is a fallback for requests that
   * bypass the proxy.
   */
  "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://apis.google.com https://accounts.google.com https://va.vercel-scripts.com https://www.google.com/recaptcha/; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src ${IMAGE_SOURCES}; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api-m.sandbox.paypal.com https://api-m.paypal.com https://*.googleapis.com https://firestore.googleapis.com https://firebase.googleapis.com https://cdn.vercel-insights.com https://analytics.vercel.com wss://*.firebaseio.com wss://*.firebasedatabase.app; frame-src 'self' https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://accounts.google.com https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-to 'csp-endpoint';`,

  /**
   * Client Hints are deliberately not requested here.
   *
   * `Sec-Ch-Ua` / `Sec-Ch-Ua-Mobile` are REQUEST headers the browser sends;
   * a server cannot set them on its own responses. It can only opt in to
   * additional hints with `Accept-CH`, which asks for MORE fingerprinting
   * material from every visitor — the opposite of the privacy concern. The
   * browser already sends its default hints on the requests Firebase and
   * PayPal see, so nothing is missing here.
   */

  /**
   * Discourages search engines from indexing the app.
   * Public pages opt back in with INDEX_ROBOTS (see src/config/seo.ts).
   * Authenticated/app pages keep noindex to avoid leaking user data.
   */
  "X-Robots-Tag": "noindex, nofollow",

  /**
   * Cross-Origin-Resource-Policy (CORP).
   * Prevents the browser from loading this resource from a different origin.
   * Only applies to static assets; harmless on HTML pages.
   */
  "Cross-Origin-Resource-Policy": "same-origin",

  /**
   * Permissions Policy (previously Feature-Policy).
   * Restricts powerful browser features.
   *
   * `publickey-credentials-get` was allowed for the passkey ceremony. The feature is
   * gone, so it is denied with the rest: nothing in this app calls
   * `navigator.credentials.get` any more, and a policy that keeps granting a
   * capability the code no longer needs is one more thing to get wrong.
   */
  "Permissions-Policy":
    "accelerometer=(), camera=(), gyroscope=(), magnetometer=(), microphone=(), " +
    "payment=(self), publickey-credentials-get=(), usb=(), geolocation=(), " +
    // `clipboard-write=(self)`: the admin backup-code list copies through
    // navigator.clipboard, and `clipboard-write=()` blocked that outright — the
    // button silently did nothing. Reading the clipboard is still denied.
    "clipboard-read=(), clipboard-write=(self), display-capture=(), " +
    "cross-origin-isolated=()",

  /**
   * Reporting Endpoints.
   *
   * Defines named endpoints (used by `report-to` in CSP, Permissions-Policy,
   * and other reporting APIs) so the browser knows where to send violations.
   * The endpoint is served at /api/csp-report.
   */
  "Reporting-Endpoints": '{"csp-endpoint":"/api/csp-report"}',

  /**
   * Report-To: the older reporting API, still read by Safari and older
   * Chromium. Modern browsers use Reporting-Endpoints above; both point at
   * the same collector so a violation is not dropped just because the
   * browser predates the newer header.
   */
  "Report-To":
    '{"group":"csp-endpoint","max_age":10886400,"endpoints":[{"url":"/api/csp-report"}]}',
};

/**
 * Content Security Policy for the production build: the policy for PRERENDERED
 * pages, which is most of them.
 *
 * It carries no nonce, and must not. A prerendered page has Next's hydration
 * bootstrap written into its HTML at BUILD time, so a nonce generated when that
 * file is served could never match those tags: attaching one was measured to
 * leave the page static and unhydrated. `'strict-dynamic'` is out for the same
 * reason - it discards the host allowlist, so the `/_next/static` chunks were
 * refused too.
 *
 * Rendered-on-demand pages are stricter still: `proxy.ts` mints a nonce per
 * request for those, so `'unsafe-inline'` is dropped in the header itself.
 *
 * Prerendered pages get the same treatment WITHOUT giving up static rendering:
 * `scripts/inject-static-csp.mjs` writes a `<meta http-equiv="Content-Security-Policy">`
 * into each built page containing `'sha256-...'` hashes of that page's own inline
 * scripts. Browsers intersect header and meta policies, so what follows is only the
 * floor - no page is actually allowed `'unsafe-inline'` once its meta is in place.
 * The floor stays permissive so a page that somehow misses the step degrades to
 * today's policy instead of a blank page.
 *
 * The paragraphs below describe that floor.
 *
 * Pages the build renders on demand are the exception, and they are where the
 * nonce comes from: `proxy.ts` replaces `script-src` with a nonce-bearing version
 * (see `applyNonceToCsp`) for exactly the routes in `dynamicRoutes.generated.ts`,
 * which the generator derives from this build's own manifest. `'unsafe-inline'` is
 * dropped there, with a `'sha256-...'` allowance for the one inline script Next
 * does not stamp (the next-themes pre-paint bootstrap).
 *
 * The directives that never depend on a nonce apply everywhere: no plugins
 * (`object-src 'none'`), no base-href hijacking, no cross-origin framing, no form
 * posts off-origin, and an explicit allowlist for the third-party SDKs we load.
 */
export function getProductionCSP(): string {
  const scriptSrc = `script-src 'self' 'unsafe-inline' https://www.gstatic.com https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://unpkg.com https://apis.google.com https://accounts.google.com https://va.vercel-scripts.com https://www.google.com/recaptcha/; script-src-attr 'none'; `;

  return (
    "default-src 'self'; " +
    scriptSrc +
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.paypal.com https://www.paypal.com; ` +
    `img-src ${IMAGE_SOURCES}; ` +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' https://api-m.sandbox.paypal.com https://api-m.paypal.com " +
    // The SDK reports to `www.paypal.com` / `www.sandbox.paypal.com`; see the
    // production policy below for the same pair.
    "https://www.paypal.com https://www.sandbox.paypal.com " +
    "https://graph.facebook.com https://www.google.com https://www.google.com/recaptcha/ https://www.googletagmanager.com " +
    "https://*.googleapis.com https://firestore.googleapis.com https://firebase.googleapis.com " +
    "https://fonts.googleapis.com https://cdn.vercel-insights.com https://analytics.vercel.com " +
    // Narrowed from a blanket `wss: https:`: every host the app actually
    // talks to is already listed above, so the wildcard only widened the
    // exfiltration surface. Firebase Realtime Database sockets stay allowed.
    "wss://*.firebaseio.com wss://*.firebasedatabase.app" +
    emulatorConnectSources() +
    "; " +
    "worker-src 'self' blob:; " +
    "media-src 'self'; " +
    `frame-src 'self' https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://accounts.google.com https://apis.google.com https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com; ` +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
    "report-to 'csp-endpoint'; " +
    "report-uri /api/csp-report; " +
    "upgrade-insecure-requests"
  );
}

/**
 * CSP for the Firebase auth helper responses (`/__/auth/*`, proxied to
 * `<project>.firebaseapp.com` by next.config.ts). The SDK embeds this helper
 * in a hidden iframe on the app's own pages to deliver sign-in results, so it
 * must be frameable from the app origin: the app-wide
 * `frame-ancestors 'none'` blocks that even same-origin and kills every
 * popup and redirect sign-in with a silent hang.
 */
export function getAuthHelperCSP(): string {
  return getProductionCSP().replace(
    "frame-ancestors 'none';",
    "frame-ancestors 'self';"
  );
}

/**
 * Cookie security options for session/auth cookies.
 *
 * Returns options that enforce Secure, HttpOnly, SameSite=Strict,
 * and host-only cookie behavior.
 */
export function getSecureCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  };
}

/**
 * Generate a secure cookie header value for session/auth cookies.
 */
export function createSecureCookieHeader(
  name: string,
  value: string,
  options?: Partial<{
    httpOnly: boolean;
    secure: boolean;
    sameSite: "strict" | "lax" | "none";
    path: string;
    maxAge: number;
  }>
): string {
  const opts = { ...getSecureCookieOptions(), ...options };
  const parts = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.secure) parts.push("Secure");
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}
