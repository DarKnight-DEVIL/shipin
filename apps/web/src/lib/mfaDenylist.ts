/**
 * Server-side revocation list for admin MFA elevation sessions — SERVER ONLY.
 *
 * A signed session cookie cannot be un-issued: clearing it on sign-out only
 * removes it from that one browser, and a token copied out of the cookie header
 * keeps verifying until it expires. Each session now carries a `jti`, and
 * revoking one writes that id to Redis for the rest of the session's lifetime,
 * so verification can reject it everywhere at once.
 *
 * Failure policy is fail-closed, matching the rate limiter: if the revocation
 * store is unreachable, the answer to "is this session revoked?" is unknown, and
 * an unknown answer must not grant admin access. A Redis outage therefore costs
 * admins a re-authentication, not a silent bypass. In development, where no
 * store is configured, sessions simply cannot be revoked.
 */

import "server-only";

import { Redis } from "@upstash/redis";

import { isProduction, serverEnv } from "@/config/env";

const KEY_PREFIX = "shipin:mfa:denied:";

let client: Redis | null = null;

/** Lazily created so importing this module never validates env at module load. */
function getRedis(): Redis | null {
  if (client === null) {
    const url = serverEnv.UPSTASH_REDIS_REST_URL;
    const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;

    if (typeof url === "string" && url.startsWith("https://") && token) {
      client = new Redis({ url, token });
    }
  }

  return client;
}

/**
 * The Redis key for a revoked session. Exported so the tests and any future
 * operational tooling agree on the shape.
 */
export function mfaDenylistKey(jti: string): string {
  return `${KEY_PREFIX}${jti}`;
}

/**
 * Mark a session revoked until it would have expired anyway.
 *
 * Best-effort by design: the caller is in the middle of signing the admin out,
 * and a failed revocation must not block that. The cookie is cleared
 * regardless, which is still the common case for a shared machine.
 */
export async function denyMfaSession(
  jti: string,
  expiresAtSeconds: number,
  now: number = Date.now()
): Promise<void> {
  // A session that has already expired cannot verify, so there is nothing to
  // store — and a negative TTL would throw in Redis.
  const ttlSeconds = Math.ceil(expiresAtSeconds - now / 1000);

  if (ttlSeconds <= 0) return;

  const redis = getRedis();

  if (!redis) {
    if (isProduction) {
      console.error(
        "[mfa] No revocation store configured, so this session cannot be " +
          "revoked server-side. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
      );
    }
    return;
  }

  try {
    await redis.set(mfaDenylistKey(jti), "1", { ex: ttlSeconds });
  } catch (error) {
    console.error("[mfa] Could not record the session revocation:", error);
  }
}

/** Whether this session id has been revoked. */
export async function isMfaSessionDenied(jti: string): Promise<boolean> {
  const redis = getRedis();

  if (!redis) {
    if (isProduction) {
      // Fail closed: without a store we cannot prove the session is still valid.
      console.error(
        "[mfa] No revocation store configured; rejecting the elevation session."
      );
      return true;
    }

    // Fail open when MFA_DENYLIST_OPTIONAL=1 is set (E2E only):
    // without a store we cannot prove revocation, so don't block.
    // Use process.env directly to avoid vitest mock issues with getters.
    const mfaOptional = process.env['MFA_DENYLIST_OPTIONAL'] === '1';
    if (mfaOptional) return false;

    return false;
  }

  try {
    return (await redis.exists(mfaDenylistKey(jti))) === 1;
  } catch (error) {
    console.error("[mfa] Could not check the revocation list:", error);
    return true;
  }
}
