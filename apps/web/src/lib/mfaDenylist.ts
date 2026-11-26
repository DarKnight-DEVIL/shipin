/**
 * Server-side revocation list for admin MFA elevation sessions — SERVER ONLY.
 *
 * A signed session cookie cannot be un-issued: clearing it on sign-out only
 * removes it from that one browser, and a token copied out of the cookie header
 * keeps verifying until it expires. Each session now carries a `jti`, and
 * revoking one writes that id to Redis for the rest of the session's lifetime,
 * so verification can reject it everywhere at once.
 *
 * Failure policy is fail-closed by default, matching the rate limiter: if the
 * revocation store is unreachable, the answer to "is this session revoked?" is
 * unknown, and an unknown answer must not grant admin access.
 *
 * That is correct and also operationally harsh: every admin request verifies a session
 * through this list, so an Upstash outage does not merely stop new elevations - it
 * evicts every admin who is mid-workflow. `MFA_DENYLIST_DEGRADED_MODE` therefore offers
 * an explicit circuit breaker for that case, and only for it:
 *
 *   - `closed` (default): an unreachable store keeps rejecting. No silent bypass.
 *   - `open`: after 3 consecutive read failures inside one degraded window, checks fail
 *     open for `MFA_DENYLIST_DEGRADED_SECONDS` (default 300, clamp 30..3600), with one
 *     critical alert when the window opens and a throttled warning per accepted
 *     verification. A successful read closes the breaker immediately.
 *
 * The trade is stated plainly because it is a real weakening: while the breaker is
 * open, a session revoked *during* the outage still verifies. It is bounded by the
 * window, it is visible in `/api/health` (`mfaDenylist`), and it cannot happen unless
 * an operator asked for it. Sessions revoked before the outage are unaffected - their
 * entries are already in Redis.
 */

import "server-only";

import { Redis } from "@upstash/redis";

import { isProduction, serverEnv } from "@/config/env";
import { captureServerError } from "@/lib/errorTracking";

const KEY_PREFIX = "shipin:mfa:denied:";

/** Consecutive read failures that open the breaker. */
export const DEGRADED_FAILURE_THRESHOLD = 3;

const DEFAULT_DEGRADED_SECONDS = 300;
const MIN_DEGRADED_SECONDS = 30;
const MAX_DEGRADED_SECONDS = 3600;

/** How often a degraded window may still poke a store it believes is down. */
const PROBE_INTERVAL_MS = 30_000;
/** One warning a minute is enough for a log-only trail while degraded. */
const DEGRADED_LOG_INTERVAL_MS = 60_000;

export type DenylistMode = "closed" | "open";

/**
 * Breaker state. Process-local on purpose: each instance decides for itself whether it
 * can reach the store, and there is nothing worth sharing over a dead connection.
 */
const circuit = {
  consecutiveFailures: 0,
  degradedUntil: 0,
  lastProbeAt: 0,
  lastWarningAt: 0,
  degradedAccepts: 0,
};

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

/** `open` only when an operator asked for it; anything else is `closed`. */
export function denylistMode(): DenylistMode {
  return serverEnv.MFA_DENYLIST_DEGRADED_MODE === "open" ? "open" : "closed";
}

function degradedSeconds(): number {
  const raw = Number(serverEnv.MFA_DENYLIST_DEGRADED_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DEGRADED_SECONDS;

  return Math.min(
    Math.max(Math.floor(raw), MIN_DEGRADED_SECONDS),
    MAX_DEGRADED_SECONDS
  );
}

/**
 * What `/api/health` reports, and the first thing an incident responder reads.
 *
 * `degraded` is the honest answer to "are revocations being enforced right now?".
 */
export interface MfaDenylistStatus {
  mode: DenylistMode;
  configured: boolean;
  degraded: boolean;
  degradedUntil: string | null;
  consecutiveFailures: number;
  /** Verifications allowed while the breaker was open. Non-zero is a review item. */
  degradedAccepts: number;
}

export function mfaDenylistStatus(now: number = Date.now()): MfaDenylistStatus {
  const mode = denylistMode();
  const degraded = mode === "open" && circuit.degradedUntil > now;

  return {
    mode,
    configured: getRedis() !== null,
    degraded,
    degradedUntil: degraded ? new Date(circuit.degradedUntil).toISOString() : null,
    consecutiveFailures: circuit.consecutiveFailures,
    degradedAccepts: circuit.degradedAccepts,
  };
}

/** Test/ops seam: forget the breaker state (e.g. after a deploy or a verified fix). */
export function resetDenylistCircuit(): void {
  circuit.consecutiveFailures = 0;
  circuit.degradedUntil = 0;
  circuit.lastProbeAt = 0;
  circuit.lastWarningAt = 0;
  circuit.degradedAccepts = 0;
}

/** One warning a minute is enough for a log-only trail while degraded. */
function warnOnce(now: number, jti: string): void {
  if (now - circuit.lastWarningAt < DEGRADED_LOG_INTERVAL_MS) return;

  circuit.lastWarningAt = now;
  console.warn(
    `[mfa] accepted session ${jti} without a revocation check: store unreachable, breaker open until ${new Date(circuit.degradedUntil).toISOString()}`
  );
}

/**
 * Retire an expired window.
 *
 * Without this a sustained outage would re-open on the first probe after the window
 * and stay open forever - a bypass with extra steps. Expiry puts the failure count back
 * to zero instead, so enforcement resumes and the threshold has to be re-earned: a duty
 * cycle rather than a one-way switch.
 */
function expireWindowIfNeeded(now: number): void {
  if (circuit.degradedUntil !== 0 && circuit.degradedUntil <= now) {
    circuit.degradedUntil = 0;
    circuit.consecutiveFailures = 0;
  }
}

/**
 * Record a failed read and, once the threshold is crossed, open the breaker. *
 * One alert per window: a dead Redis produces a failure on every admin request, and an
 * alert storm is indistinguishable from an outage in the alerting channel itself.
 */
function recordReadFailure(now: number, error: unknown): void {
  expireWindowIfNeeded(now);

  circuit.consecutiveFailures += 1;

  if (denylistMode() !== "open") return;
  if (circuit.consecutiveFailures < DEGRADED_FAILURE_THRESHOLD) return;

  const wasOpen = circuit.degradedUntil > now;
  circuit.degradedUntil = now + degradedSeconds() * 1000;

  if (wasOpen) return;

  console.error(
    `[mfa] revocation store unreachable ${circuit.consecutiveFailures} times; allowing MFA sessions for ${degradedSeconds()}s (set MFA_DENYLIST_DEGRADED_MODE=closed to refuse instead).`
  );

  void captureServerError(
    error instanceof Error ? error : new Error("revocation store unreachable"),
    {
      category: "mfa-store",
      severity: "critical",
      code: "MFA_DENYLIST_DEGRADED_OPEN",
      context: {
        consecutiveFailures: circuit.consecutiveFailures,
        degradedSeconds: degradedSeconds(),
        note: "Elevation sessions are being accepted without a revocation check.",
      },
    }
  );
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

  const now = Date.now();

  expireWindowIfNeeded(now);

  /*
   * While the breaker is open, stop hammering the store: a dead Redis answers every
   * attempt with a timeout, and waiting for it on every admin request is how an outage
   * becomes a slow outage. One probe every 30s is enough to notice recovery, and the
   * read that succeeds closes the breaker.
   */
  if (denylistMode() === "open" && circuit.degradedUntil > now) {
    if (now - circuit.lastProbeAt < PROBE_INTERVAL_MS) {
      circuit.degradedAccepts += 1;
      warnOnce(now, jti);
      return false;
    }
  }

  circuit.lastProbeAt = now;

  try {
    const denied = (await redis.exists(mfaDenylistKey(jti))) === 1;

    // A working store closes the breaker and clears the failure count immediately:
    // the next outage has to earn its way back through the threshold.
    circuit.consecutiveFailures = 0;
    circuit.degradedUntil = 0;
    circuit.lastProbeAt = 0;

    return denied;
  } catch (error) {
    /*
     * Below the threshold, and always in `closed` mode, the answer stays "unknown" and
     * therefore "refuse" - the same promise this module made before the breaker.
     */
    recordReadFailure(now, error);

    if (denylistMode() !== "open" || circuit.degradedUntil <= now) {
      void captureServerError(error, {
        category: "mfa-store",
        severity: "critical",
        code: "MFA_DENYLIST_READ_FAILED",
        context: { jti },
      });
      return true;
    }

    /*
     * Degraded and open: the store is dark, admins are mid-workflow, and this instance
     * has decided availability wins for a bounded window. Counted and logged, because a
     * verification that skipped its revocation check is exactly what an incident review
     * needs to find afterwards.
     */
    circuit.degradedAccepts += 1;
    warnOnce(now, jti);

    return false;
  }
}
