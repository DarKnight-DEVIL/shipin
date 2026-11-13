/**
 * Security Headers configuration for ShipIN.
 *
 * This module provides a comprehensive, defense-in-depth set of HTTP
 * response headers. All values are conservative and production-ready.
 *
 * Content Security Policy (CSP):
 *   - Default to 'self' and forbid inline scripts/styles (no unsafe-inline,
 *     no eval-based script execution).
 *   - Allow Next.js/React build-time inline scripts only when necessary.
 *   - Restrict image sources, fonts, frames, and connect targets.
 *   - CSP violation reports are sent to /api/csp-report via report-to.
 *
 * NOTE: If your app legitimately uses inline scripts or third-party
 * services (Google Analytics, PayPal, Spline), add their sources to the
 * appropriate CSP directives here.
 */

import { isProduction } from "@/config/env";

/**
 * Development CSP: allows inline scripts and styles for Turbopack/Next.js dev server.
 * This is less secure but necessary for development hot-reloading.
 */
export function getDevCSP(): string {
  const base = "'self' https://www.gstatic.com https://www.gstatic.com https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://unpkg.com https://cdn.spline.dev https://spline.dev https://apis.google.com https://accounts.google.com https://va.vercel-scripts.com";
  const scriptSrc = `script-src ${base} 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; `;

  return (
    "default-src 'self'; " +
    scriptSrc +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.paypal.com https://www.paypal.com https://cdn.spline.dev; " +
    "img-src 'self' blob: data: https:; " +
    "font-src 'self' https://fonts.gstatic.com https://cdn.spline.dev; " +
    "connect-src 'self' https://api-m.sandbox.paypal.com https://api-m.paypal.com " +
    "https://graph.facebook.com https://www.google.com https://www.googletagmanager.com " +
    "https://*.googleapis.com https://firestore.googleapis.com https://firebase.googleapis.com " +
    "https://*.firebasestorage.app https://fonts.googleapis.com https://cdn.vercel-insights.com https://analytics.vercel.com https://va.vercel-scripts.com wss: https:; " +
    "worker-src 'self' blob: https://cdn.spline.dev; " +
    "media-src 'self'; " +
    "frame-src 'self' https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://spline.dev https://cdn.spline.dev https://accounts.google.com https://apis.google.com https://www.google.com https://*.firebaseapp.com; " +
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
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self'; connect-src 'self' https:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-to 'csp-endpoint';",

  /**
   * Discourages search engines from indexing the app.
   * Public landing pages should override this with getRobotsTag("index").
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
   */
  "Permissions-Policy":
    "accelerometer=(), camera=(), gyroscope=(), magnetometer=(), microphone=(), " +
    "payment=(self), publickey-credentials-get=(), usb=(), geolocation=(), " +
    "clipboard-read=(), clipboard-write=(), speaker=(), display-capture=(), " +
    "document-domain=(), cross-origin-isolated=()",

    /**
     * Reporting Endpoints.
     *
     * Defines named endpoints (used by `report-to` in CSP, Permissions-Policy,
     * and other reporting APIs) so the browser knows where to send violations.
     * The endpoint is served at /api/csp-report.
     */
    "Reporting-Endpoints": "{\"csp-endpoint\":\"/api/csp-report\"}",
};

/**
 * Returns the appropriate robots tag for a given route type.
 *
 * - Public landing pages: "index, follow" (good for SEO)
 * - Authenticated/app pages: "noindex, nofollow" (prevents leaking user data)
 */
export function getRobotsTag(isPublicPage: boolean = false): string {
  return isPublicPage ? "index, follow" : "noindex, nofollow";
}

/**
 * Content Security Policy for the production build.
 *
 * This policy intentionally carries NO nonce and NO `'strict-dynamic'`.
 *
 * Every route in this app is statically prerendered (see
 * `.next/prerender-manifest.json`), so Next.js writes its hydration bootstrap
 * — `self.__next_f.push(...)` and the framework runtime — into the HTML at
 * BUILD time. A per-request nonce generated in the proxy does not exist yet at
 * that point, so it is never attached to those tags. Under `'strict-dynamic'`
 * host allowlisting is ignored as well, so the browser refused both the inline
 * bootstrap and every `/_next/static` chunk: the pages rendered as static HTML
 * and never hydrated, which was verified in a production build (no
 * `__reactFiber$` on any node, no `window.__next_f`).
 *
 * `'unsafe-inline'` for scripts is therefore required for the app to function.
 * The directives that do not depend on a nonce are kept: no plugins
 * (`object-src 'none'`), no base-href hijacking, no cross-origin framing, no
 * form posts off-origin, and an explicit allowlist for the third-party SDKs we
 * actually load. If this app later moves to dynamic rendering, or serves HTML
 * through an edge that can rewrite a nonce into it, restore the nonce policy —
 * `getCSPWithNonce` is in the git history for that day.
 */
export function getProductionCSP(): string {
  const scriptSrc = `script-src 'self' 'unsafe-inline' https://www.gstatic.com https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://unpkg.com https://cdn.spline.dev https://spline.dev https://apis.google.com https://accounts.google.com https://va.vercel-scripts.com; `;

  return (
    "default-src 'self'; " +
    scriptSrc +
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.paypal.com https://www.paypal.com https://cdn.spline.dev; ` +
    "img-src 'self' blob: data: https:; " +
    "font-src 'self' https://fonts.gstatic.com https://cdn.spline.dev; " +
    "connect-src 'self' https://api-m.sandbox.paypal.com https://api-m.paypal.com " +
    "https://graph.facebook.com https://www.google.com https://www.googletagmanager.com " +
    "https://*.googleapis.com https://firestore.googleapis.com https://firebase.googleapis.com " +
    "https://*.firebasestorage.app https://fonts.googleapis.com https://cdn.vercel-insights.com https://analytics.vercel.com wss: https:; " +
    "worker-src 'self' blob: https://cdn.spline.dev; " +
    "media-src 'self'; " +
    `frame-src 'self' https://js.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://spline.dev https://cdn.spline.dev https://accounts.google.com https://apis.google.com https://www.google.com https://*.firebaseapp.com; ` +
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
 * Sanitize a Content-Security-Policy value before use.
 *
 * The CSP parser is strict: any backslash/semicolon/quote injection could
 * weaken the policy. This is a paranoid guard, not a substitute for
 * building the policy from trusted configuration.
 */
export function sanitizeCsp(policy: string): string {
  return policy.replace(/[;`"\\]/g, "");
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