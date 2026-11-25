/**
 * Who a rate-limit budget belongs to.
 *
 * Per-IP budgets break in two ways that matter for this app. Mobile carriers,
 * offices and campuses in the launch market put thousands of people behind one
 * CGNAT address, so one 30/min budget is shared by strangers and one of them
 * exhausts it; and an authenticated account has no budget of its own at all, so
 * a signed-in user on a shared address is throttled by their neighbours.
 *
 * A request carrying a Bearer token is therefore metered per account. The token
 * is only DECODED here, never verified — verification belongs to the route
 * handler, and doing it twice would mean an extra round trip on every request.
 * That means `sub` is untrusted input: an attacker can mint tokens with made-up
 * subjects and get a fresh bucket each time. The per-address ceiling in
 * `createSharedRateLimiter` is what bounds that abuse; this module only answers
 * "which bucket does this request count against".
 */

import { getClientIp } from "./clientIp";

/** Bucket used when the deployment cannot identify the caller at all. */
export const UNIDENTIFIED_SUBJECT = "127.0.0.1";

/**
 * How much more per-address budget an authenticated caller may spend than a
 * single account may. An account stays at its own limit; the ceiling only stops
 * token rotation (a forged `sub` per request) from turning a per-account limit
 * into no limit at all.
 */
export const TOKEN_IP_CEILING_MULTIPLIER = 10;

export interface RateLimitSubject {
  /**
   * Bucket key. An address keeps the bare key it always had, so existing Redis
   * counters and health output need no migration; an account is namespaced with
   * `u:` so a forged `sub` can never collide with an address bucket.
   */
  key: string;
  kind: "uid" | "ip";
  /** The client address, always present so callers can apply a ceiling. */
  ip: string;
}

/** A Firebase uid is a 28-char alphanumeric string; refuse anything odd. */
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The `sub` claim of an unverified Bearer JWT, or null.
 *
 * Deliberately strict: a token that is not three dot-separated segments, whose
 * payload is not JSON, or whose `sub` is not uid-shaped yields null and the
 * caller falls back to the address bucket. Throwing or returning a partial
 * value here would put an attacker-chosen string into a Redis key.
 */
export function readBearerUid(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const token = header.replace(/^Bearer\s+/i, "").trim();
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  const payload = segments[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const decoded = JSON.parse(atob(padded)) as { sub?: unknown };
    const sub = decoded.sub;
    return typeof sub === "string" && UID_PATTERN.test(sub) ? sub : null;
  } catch {
    // A malformed token is not an error worth surfacing: the route handler
    // rejects it with 401 far more precisely than the limiter could.
    return null;
  }
}

/**
 * The bucket a request counts against, plus the address used for the ceiling.
 *
 * `ip` falls back to `UNIDENTIFIED_SUBJECT` when the deployment has declared no
 * trusted proxy chain (`clientIp.ts`), which keeps anonymous traffic in one
 * shared bucket instead of letting a client mint its own.
 */
export function rateLimitSubject(request: Request): RateLimitSubject {
  const ip = getClientIp(request) ?? UNIDENTIFIED_SUBJECT;
  const uid = readBearerUid(request);

  return uid
    ? { key: `u:${uid}`, kind: "uid", ip }
    : { key: ip, kind: "ip", ip };
}
