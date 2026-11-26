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
import { captureServerError } from "@/lib/errorTracking";

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
      // A revocation that cannot be recorded is a security event, not a log
      // line: the session an operator just killed stays usable.
      void captureServerError(
        new Error(
          "No revocation store configured, so this session cannot be revoked server-side."
        ),
        {
          category: "mfa-store",
          severity: "critical",
          code: "MFA_DENYLIST_UNCONFIGURED",
        }
      );
    }
    return;
  }

  try {
    await redis.set(mfaDenylistKey(jti), "1", { ex: ttlSeconds });
  } catch (error) {
    void captureServerError(error, {
      category: "mfa-store",
      severity: "critical",
      code: "MFA_DENYLIST_WRITE_FAILED",
      context: { jti },
    });
  }
}

/** Whether this session id has been revoked. */
export async function isMfaSessionDenied(jti: string): Promise<boolean> {
  const redis = getRedis();

  if (!redis) {
    // Without a store the answer to "revoked?" is unknown, so production fails
    // closed — except for the E2E opt-out (never set on a deployment), where
    // failing closed would reject every elevation the run just created.
    if (isProduction && process.env["MFA_DENYLIST_OPTIONAL"] !== "1") {
      void captureServerError(
        new Error(
          "No revocation store configured; every elevation session is being rejected."
        ),
        {
          category: "mfa-store",
          severity: "critical",
          code: "MFA_DENYLIST_UNCONFIGURED",
        }
      );
      return true;
    }

    // Development (or the E2E opt-out): nothing to revoke against.
    return false;
  }

  try {
    return (await redis.exists(mfaDenylistKey(jti))) === 1;
  } catch (error) {
    void captureServerError(error, {
      category: "mfa-store",
      severity: "critical",
      code: "MFA_DENYLIST_READ_FAILED",
      context: { jti },
    });
    return true;
  }
}
