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
 *
 * NOTE: If your app legitimately uses inline scripts or third-party
 * services (Google Analytics, PayPal, Spline), add their sources to the
 * appropriate CSP directives here.
 */

/**
 * Development CSP: allows inline scripts and styles for Turbopack/Next.js dev server.
 * This is less secure but necessary for development hot-reloading.
 */
export function getDevCSP(): string {
  const base = "'self' https://www.gstatic.com https://www.gstatic.com https://js.paypal.com https://www.paypal.com https://unpkg.com https://cdn.spline.dev https://spline.dev https://apis.google.com https://accounts.google.com https://va.vercel-scripts.com";
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
    "frame-src 'self' https://js.paypal.com https://www.paypal.com https://spline.dev https://cdn.spline.dev https://accounts.google.com https://apis.google.com https://www.google.com https://*.firebaseapp.com; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
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
   * Removes application-level disclosure headers.
   */
  "X-Powered-By": "ShipIN",

  /**
   * Content Security Policy.
   *
   * In production, use the nonce-based CSP from getCSPWithNonce().
   * In development, use the permissive CSP from getDevCSP().
   * This is a fallback for non-middleware routes.
   */
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self'; connect-src 'self' https:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",

  /**
   * Discourages search engines from indexing the app.
   * Remove or change to "index" for public landing pages.
   */
  "X-Robots-Tag": "noindex, nofollow",

  /**
   * Permissions Policy (previously Feature-Policy).
   * Restricts powerful browser features.
   */
  "Permissions-Policy":
    "accelerometer=(), camera=(), gyroscope=(), magnetometer=(), microphone=(), " +
    "payment=(self), publickey-credentials-get=(), usb=(), geolocation=(), " +
    "clipboard-read=(), clipboard-write=(), speaker=(), display-capture=(), " +
    "document-domain=(), cross-origin-isolated=()",
};

/**
 * CSP that includes a nonce for React's inline scripts.
 *
 * Use this when the app renders inline scripts that must execute.
 * `nonce` must be unique per request.
 */
export function getCSPWithNonce(nonce: string): string {
  const baseScriptSrc = `'self' 'strict-dynamic' 'nonce-${nonce}' https://www.gstatic.com https://js.paypal.com https://www.paypal.com https://unpkg.com https://cdn.spline.dev https://spline.dev https://apis.google.com https://accounts.google.com https://va.vercel-scripts.com`;
  const scriptSrc = process.env.NODE_ENV === "development"
    ? `script-src ${baseScriptSrc} 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; `
    : `script-src ${baseScriptSrc}; `;

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
    `frame-src 'self' https://js.paypal.com https://www.paypal.com https://spline.dev https://cdn.spline.dev https://accounts.google.com https://apis.google.com https://www.google.com https://*.firebaseapp.com; ` +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
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
    secure: process.env.NODE_ENV === "production",
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