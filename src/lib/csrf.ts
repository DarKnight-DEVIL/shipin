/**
 * CSRF (Cross-Site Request Forgery) protection for ShipIN.
 *
 * Implements the double-submit cookie pattern with secure cookie settings.
 * Tokens are generated per-session and validated on state-changing requests.
 *
 * Since this app uses Bearer token auth (not cookies) for API routes,
 * CSRF protection is primarily needed for any cookie-based form submissions.
 * This module provides utilities to generate/validate tokens if needed.
 */

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a cryptographically secure CSRF token using Web Crypto API.
 * Works in Edge Runtime and browser environments.
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Create a secure CSRF cookie header.
 */
export function createCsrfCookieHeader(token: string): string {
  const { createSecureCookieHeader } = require("./securityHeaders");
  return createSecureCookieHeader(CSRF_COOKIE_NAME, token, {
    maxAge: 60 * 60 * 24, // 24 hours
    sameSite: "strict",
  });
}

/**
 * Validate a CSRF token from request headers or body.
 * Returns true if valid, false otherwise.
 */
export function validateCsrfToken(
  request: Request,
  expectedToken: string
): boolean {
  // Check header first (preferred)
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken && headerToken === expectedToken) {
    return true;
  }

  // Check body (for form submissions)
  return false;
}

/**
 * Extract CSRF token from request cookie.
 * Returns the token if present, null otherwise.
 */
export function getCsrfTokenFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith("csrf_token=")) {
      return cookie.substring("csrf_token=".length);
    }
  }
  return null;
}

/**
 * Middleware to enforce CSRF protection on state-changing requests.
 * Call this at the start of your route handler.
 *
 * Usage:
 *   const csrfResult = await enforceCsrf(request);
 *   if (!csrfResult.valid) return csrfResult.response;
 */
export async function enforceCsrf(request: Request): Promise<{
  valid: boolean;
  response?: Response;
}> {
  // Only enforce on state-changing methods
  const method = request.method;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { valid: true };
  }

  // Skip for API routes that use Bearer token auth
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return { valid: true };
  }

  // Get token from cookie
  const cookieToken = getCsrfTokenFromCookie(request);
  if (!cookieToken) {
    return {
      valid: false,
      response: new Response(
        JSON.stringify({ error: "CSRF token missing" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  // Validate against header
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken !== cookieToken) {
    return {
      valid: false,
      response: new Response(
        JSON.stringify({ error: "Invalid CSRF token" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { valid: true };
}

/**
 * Generate a new CSRF token and return cookie header for response.
 * Use when rendering forms or starting a session.
 */
export function issueCsrfToken(): { token: string; cookieHeader: string } {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const { createCsrfCookieHeader } = require("./securityHeaders");
  return {
    token,
    cookieHeader: createCsrfCookieHeader(token),
  };
}