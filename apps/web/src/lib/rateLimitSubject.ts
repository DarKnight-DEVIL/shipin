/**
 * Who a rate-limit budget belongs to.
 *
 * Per-IP budgets break in two ways that matter for this app. Mobile carriers,
 * offices and campuses in the launch market put thousands of people behind one
 * CGNAT address, so one 30/min budget is shared by strangers and one of them
 * exhausts it; and an authenticated account has no budget of its own at all, so
 * a signed-in user on a shared address is throttled by their neighbours.
 *
 * A request carrying a verifiable Firebase ID token is therefore metered per
 * account. Verified, not merely decoded: the earlier version read `sub` out of
 * the JWT without checking the signature, so a caller could mint a token with an
 * invented subject, get a fresh bucket for every request, and rotate addresses to
 * reset the per-address ceiling that was supposed to bound it. The identity that
 * decides a budget has to be one we actually know, so verification happens here
 * and an unverifiable token falls back to the address bucket.
 *
 * Verification is cached per token for a few minutes: Firebase signs an ID token
 * for an hour, and the proxy sees every request, so verifying each one would put
 * a signature check on every page load for no additional security.
 */

import { getClientIp } from "./clientIp";
import { stableHash } from "./stableHash";

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
 * The bucket a request counts against, plus the address used for the ceiling.
 *
 * `ip` falls back to `UNIDENTIFIED_SUBJECT` when the deployment has declared no
 * trusted proxy chain (`clientIp.ts`), which keeps anonymous traffic in one
 * shared bucket instead of letting a client mint its own.
 */
/** How long a verified token's identity is reused before verifying again. */
const VERIFY_CACHE_MS = 5 * 60 * 1000;
/** A failure is cached briefly: an outage must not trigger a verify per request. */
const VERIFY_FAILURE_CACHE_MS = 30 * 1000;
/** Bounded so a flood of distinct tokens cannot grow the map without limit. */
const VERIFY_CACHE_LIMIT = 500;

interface CachedIdentity {
  uid: string | null;
  expiresAt: number;
}

const verifiedIdentities = new Map<string, CachedIdentity>();

/** A stable cache key: the token itself is never held as a map key in memory. */
function tokenFingerprint(token: string): string {
  // A cache key, not a digest: no `node:crypto` in this module's graph, because
  // the proxy is compiled for the edge runtime as well.
  return stableHash(token);
}

const bearerTokenOf = (request: Request): string | null => {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token || null;
};

/**
 * The uid behind a token, only if Firebase's signature says it is genuine.
 *
 * Any failure — expired token, wrong project, unreachable keys, malformed JWT —
 * yields null, and the caller falls back to the address bucket. That is the safe
 * direction: the route handler still rejects the request, and no forged claim can
 * buy a budget of its own.
 */
export async function verifyBearerUid(token: string): Promise<string | null> {
  try {
    const { ensureAdminApp } = await import("@/lib/firebaseAdmin");
    const { getAuth } = await import("firebase-admin/auth");
    const decoded = await getAuth(ensureAdminApp()).verifyIdToken(token);

    return typeof decoded.uid === "string" && UID_PATTERN.test(decoded.uid)
      ? decoded.uid
      : null;
  } catch {
    return null;
  }
}

/**
 * The subject for a request, using a verified identity when there is one.
 *
 * `verifiedUid` is a parameter rather than something read inside so the cache
 * and the verification can be tested without minting real tokens.
 */
export async function resolveRateLimitSubject(
  request: Request,
  verify: (token: string) => Promise<string | null> = bearerVerifier
): Promise<RateLimitSubject> {
  const token = bearerTokenOf(request);

  if (!token) return rateLimitSubject(request);

  const fingerprint = tokenFingerprint(token);
  const cached = verifiedIdentities.get(fingerprint);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return rateLimitSubject(request, cached.uid);
  }

  const uid = await verify(token);

  if (verifiedIdentities.size >= VERIFY_CACHE_LIMIT) verifiedIdentities.clear();
  verifiedIdentities.set(fingerprint, {
    uid,
    expiresAt: now + (uid ? VERIFY_CACHE_MS : VERIFY_FAILURE_CACHE_MS),
  });

  return rateLimitSubject(request, uid);
}

let bearerVerifier: (token: string) => Promise<string | null> = verifyBearerUid;

/**
 * Test hook: replace the verifier.
 *
 * Bucket selection depends on verification, and minting real Firebase tokens in a
 * unit test is not possible - so the verifier is the seam. Nothing in production
 * calls this.
 */
export function setBearerVerifierForTests(
  verify: (token: string) => Promise<string | null>
): void {
  bearerVerifier = verify;
  verifiedIdentities.clear();
}

/** Test hook: forget every cached identity. */
export function resetRateLimitSubjectCacheForTests(): void {
  verifiedIdentities.clear();
}

export function rateLimitSubject(
  request: Request,
  verifiedUid: string | null = null
): RateLimitSubject {
  const ip = getClientIp(request) ?? UNIDENTIFIED_SUBJECT;

  return verifiedUid
    ? { key: `u:${verifiedUid}`, kind: "uid", ip }
    : { key: ip, kind: "ip", ip };
}
