/**
 * Shared (cross-instance) rate limiter backed by Upstash Redis.
 *
 * The existing in-memory limiter in rateLimiter.ts only counts requests
 * per Node.js process, so on Vercel (or any multi-instance deployment)
 * a client could spread its requests across many instances and bypass
 * the limit. This module stores counters in Redis so the limit holds
 * globally.
 *
 * Behavior:
 *   - If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_TOKEN are not set in production,
 *     the deployment is DEGRADED, not down: startup logs one warning, limits
 *     fall back to the per-instance in-memory path, and /api/health reports
 *     `degraded` so uptime monitoring can see the gap. Per-instance limits
 *     cannot enforce global limits across serverless regions, which is exactly
 *     why this must be visible rather than silent.
 *   - In development/test, falls back to in-memory limiter when Redis is not configured.
 */

import { childLogger } from "./logger";

/**
 * Shared (cross-instance) rate limiter backed by Upstash Redis.
 *
 * The existing in-memory limiter in rateLimiter.ts only counts requests
 * per Node.js process, so on Vercel (or any multi-instance deployment)
 * a client could spread its requests across many instances and bypass
 * the limit. This module stores counters in Redis so the limit holds
 * globally.
 *
 * Behavior:
 *   - If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_TOKEN are not set in production,
 *     the deployment is DEGRADED, not down: startup logs one warning, limits
 *     fall back to the per-instance in-memory path, and /api/health reports
 *     `degraded` so uptime monitoring can see the gap. Per-instance limits
 *     cannot enforce global limits across serverless regions, which is exactly
 *     why this must be visible rather than silent.
 *   - In development/test, falls back to in-memory limiter when Redis is not configured.
 *   - If Redis is configured but a call fails (network error, timeout), the
 *     limiter returns `unavailable`: the request is NOT rejected, because a
 *     store outage must never lock every user out (see the fail-open branch in
 *     `proxy.ts`). The failure is counted, logged via {@link reportRedisError},
 *     and surfaced by /api/health.
 *   - Genuine over-limit rejections (a reachable store saying "no") are 429s.
 *   - Counters are keyed by IP with a route prefix so the web, api,
 *     strict, and login limits don't share a bucket.
 *   - Ratelimit instances are created ONCE per limiter name (singleton pattern)
 *     to avoid connection overhead and Upstash connection limits.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import {
  serverEnv,
  isProduction,
  isRateLimitStoreOptional,
  RATE_LIMIT_STORE_OPTIONAL_ENV,
} from "@/config/env";
import {
  TOKEN_IP_CEILING_MULTIPLIER,
  resolveRateLimitSubject,
} from "@/lib/rateLimitSubject";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  reset: number;
  /**
   * True when the rejection is an infrastructure failure (no shared store or a
   * Redis error) rather than the client actually exceeding the limit.
   * Callers that guard user-facing flows (sign-in) can fail open on this while
   * still rejecting genuine abuse.
   */
  unavailable?: boolean;
}

/** Milliseconds used as the sliding-window cutoff for error-count queries. */
export const RATE_LIMIT_ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * E2E-only switch that turns the per-IP limits into a no-op.
 *
 * The local E2E suite drives one browser from 127.0.0.1, so every request
 * shares a bucket: a single run spends the 100-request web budget inside one
 * window and the proxy then answers 429 to pages, robots.txt and sitemap.xml
 * mid-suite. CI failed that way intermittently — the run either finished
 * inside the window or did not.
 *
 * Only `scripts/e2e-local.mjs` sets this. A production build needs a second,
 * self-describing acknowledgement (`E2E_RATE_LIMITS_DISABLED_ACK=1`) on top of
 * the variable: a deployment that copied the suite's environment - including
 * the `RATE_LIMIT_STORE_OPTIONAL` boot-check waiver - used to disable its own
 * rate limiting as a side effect, because one waiver quietly served as two
 * switches. The ack keeps the two meanings apart, and /api/health reports the
 * disabled state so even a deliberate use is visible.
 */
export const RATE_LIMIT_DISABLED_ENV = "RATE_LIMIT_DISABLED";
export const RATE_LIMIT_DISABLED_ACK_ENV = "E2E_RATE_LIMITS_DISABLED_ACK";

export function isRateLimitingDisabled(): boolean {
  if (process.env[RATE_LIMIT_DISABLED_ENV] !== "1") return false;

  if (process.env.NODE_ENV !== "production") return true;

  return process.env[RATE_LIMIT_DISABLED_ACK_ENV] === "1";
}

/** Redis hash holding per-IP error counters, one per limiter. */
const ERROR_HASH_PREFIX = "shipin:ratelimit:errors:";
const ERROR_HASH_TTL_SECONDS = 10 * 60;

/**
 * Report a Redis rate-limiting failure.
 *
 * A store outage means every per-IP limit is unenforced until it recovers, so
 * this is logged at error level and the counter behind it is what /api/health
 * reads. The client address is deliberately not logged: it is personal data
 * and the limiter name is enough to find the failing call path.
 */
function reportRedisError(limiterName: string, clientIp: string): void {
  if (!isProduction) return;
  void clientIp;

  try {
    childLogger({ service: "rate-limiter" }).error(
      "[RateLimiter] Redis call failed; limits are not enforced for this request",
      { limiter: limiterName }
    );
  } catch {
    // Logging must never mask the original failure path.
  }
}

/* ============================================================
 * Store-outage escalation.
 *
 * The proxy fails open on `unavailable` on purpose (the chaos suite pins
 * that), but fail-open must not mean fail-silent: the error counters and
 * /api/health's `degraded` are pull signals someone has to poll. Once a
 * limiter accumulates enough store failures inside the error window, this
 * pushes ONE deduplicated message to the operator webhook, so a human finds
 * out about an unmetered API without polling anything.
 * ============================================================ */

/** Store failures inside the error window before the outage is worth paging. */
const STORE_OUTAGE_ALERT_THRESHOLD = 10;

/** Minimum spacing between outage alerts for one limiter. */
const STORE_OUTAGE_ALERT_DEDUPE_MS = 30 * 60 * 1000;

const STORE_OUTAGE_ALERT_TIMEOUT_MS = 5_000;

/** Per limiter: failures seen, the window they count within, last alert sent. */
const outageTracker = new Map<
  string,
  { errors: number; windowStart: number; lastAlertAt: number }
>();

/**
 * The dedicated channel first, then the generic operator webhook — the same
 * dedicated-then-fallback order the App Check and breach alerts use.
 */
function resolveStoreOutageAlertUrl(): string | null {
  const dedicated = process.env.ERROR_ALERT_WEBHOOK_URL?.trim();
  if (dedicated) return dedicated;
  return process.env.ALERT_WEBHOOK_URL?.trim() || null;
}

function deploymentEnvironment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
}

export interface StoreOutageAlertPayload {
  content: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
  }>;
}

export function buildStoreOutageAlertPayload(
  limiterName: string,
  errors: number,
  now = Date.now()
): StoreOutageAlertPayload {
  return {
    content: `🚨 **Rate-limit store outage** — ${errors} store failures in the last 5 minutes (${deploymentEnvironment()})`,
    embeds: [
      {
        title: "Rate-limit store outage",
        description:
          "The shared rate-limit store (Upstash Redis) is failing: every API " +
          "limit is currently unenforced and the proxy is serving requests " +
          "fail-open. Auth and App Check still gate the routes, but abuse " +
          "metering is off until the store answers again.",
        color: 0xed4245,
        fields: [
          { name: "Limiter", value: limiterName, inline: true },
          { name: "Failures (5 min)", value: String(errors), inline: true },
          { name: "Environment", value: deploymentEnvironment(), inline: true },
          {
            name: "Remediation",
            value:
              "Check the Upstash dashboard (status, quota, credentials). " +
              "/api/health reports `degraded` until the store recovers; " +
              "limits resume automatically on recovery — no restart needed.",
          },
        ],
        timestamp: new Date(now).toISOString(),
      },
    ],
  };
}

/**
 * POST the payload to the configured webhook.
 *
 * Never throws and is never awaited on the request path: a slow or broken
 * webhook must not add latency to a request that is already being served
 * without a limit. The 5s timeout bounds a hanging Discord request.
 */
export async function dispatchStoreOutageAlert(
  payload: StoreOutageAlertPayload
): Promise<void> {
  const url = resolveStoreOutageAlertUrl();
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(STORE_OUTAGE_ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Status only: the URL is a credential, so it never reaches the logs.
      console.warn("Store-outage alert webhook rejected the payload", {
        status: response.status,
      });
    }
  } catch (error) {
    console.warn("Store-outage alert webhook could not be reached", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const defaultOutageAlertSender: (payload: StoreOutageAlertPayload) => void = (
  payload
) => {
  void dispatchStoreOutageAlert(payload);
};

let sendOutageAlert: (payload: StoreOutageAlertPayload) => void =
  defaultOutageAlertSender;

/** Test hook: replace the alert sender (reset by resetStoreOutageAlertForTests). */
export function setStoreOutageAlertSenderForTests(
  sender: (payload: StoreOutageAlertPayload) => void
): void {
  sendOutageAlert = sender;
}

export function resetStoreOutageAlertForTests(): void {
  sendOutageAlert = defaultOutageAlertSender;
  outageTracker.clear();
}

/**
 * Count one more store failure for this limiter and escalate when the window
 * crosses the threshold. Synchronous and never throwing: this runs inside the
 * limiter's error path, which must stay as cheap as serving the request.
 */
function maybeEscalateStoreOutage(limiterName: string, now = Date.now()): void {
  if (!isProduction) return;
  if (!resolveStoreOutageAlertUrl()) return;

  const entry =
    outageTracker.get(limiterName) ?? {
      errors: 0,
      windowStart: now,
      lastAlertAt: 0,
    };

  if (now - entry.windowStart > RATE_LIMIT_ERROR_WINDOW_MS) {
    entry.errors = 0;
    entry.windowStart = now;
  }

  entry.errors += 1;

  if (entry.errors < STORE_OUTAGE_ALERT_THRESHOLD) {
    outageTracker.set(limiterName, entry);
    return;
  }

  if (now - entry.lastAlertAt < STORE_OUTAGE_ALERT_DEDUPE_MS) {
    outageTracker.set(limiterName, entry);
    return;
  }

  entry.lastAlertAt = now;
  entry.errors = 0;
  entry.windowStart = now;
  outageTracker.set(limiterName, entry);

  sendOutageAlert(buildStoreOutageAlertPayload(limiterName, STORE_OUTAGE_ALERT_THRESHOLD, now));
}

function isValidRedisUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    // Upstash REST URLs are of the form https://<id>.upstash.io
    // Reject obviously wrong hostnames (e.g., missing ID like https://upstash.io)
    return /^[a-z0-9-]+\.upstash\.io$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Throw at startup if the rate-limiting shared store is missing in
 * production. A per-instance in-memory limiter cannot enforce global
 * limits across serverless regions, so for a financial application
 * that is a hard failure — not a soft warning.
 */
export type RateLimitStoreStatus = {
  /** Whether the shared store is usable on this deployment. */
  configured: boolean;
  /** True when production is running without a shared store. */
  degraded: boolean;
};

/**
 * Describe the state of the shared rate-limit store.
 *
 * Missing configuration in production is a degraded deployment, not a fatal
 * error. The proxy fails open on `unavailable` results and /api/health reports
 * `degraded`; throwing here contradicted both, and it meant no production
 * build could boot without a real Upstash database (local E2E, previews).
 */
export function getRateLimitStoreStatus(): RateLimitStoreStatus {
  const url = serverEnv.UPSTASH_REDIS_REST_URL;
  const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;
  const configured = isValidRedisUrl(url) && Boolean(token);
  const degraded = isProduction && !configured;

  return { configured, degraded };
}

/**
 * Log the store status once at startup. Never throws: a missing store degrades
 * rate limiting, and taking the whole deployment down over a variable a human
 * can set live would deny service instead of protecting it.
 */
export function reportRateLimitStoreStatus(): RateLimitStoreStatus {
  const status = getRateLimitStoreStatus();

  if (status.degraded) {
    const rateLimiterLogger = childLogger({ service: "rate-limiter" });
rateLimiterLogger.warn(
      "[RateLimiter] UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN are not set in production. " +
        "Rate limits are per-instance only; /api/health reports this as degraded. " +
        "Set both variables to enforce limits across serverless regions."
    );
  }

  return status;
}

// --- Redis client & Ratelimit instances (lazy singletons) ---

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis === null) {
    const url = serverEnv.UPSTASH_REDIS_REST_URL;
    const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;
    if (isValidRedisUrl(url) && token) {
      redis = new Redis({ url, token });
    }
  }
  return redis;
}

/**
 * The shared Redis client, or null when no store is configured.
 *
 * Exported for the few callers that need a counter rather than a sliding
 * window (the notification rate limit); Ratelimit instances stay private.
 */
export function getSharedRedisClient(): Redis | null {
  return getRedis();
}

/**
 * Test hook: forget the cached client and Ratelimit instances.
 *
 * The suite runs with `isolate: false`, so a module file that mocks the store
 * leaves this singleton populated for every later file in the worker. A file
 * that wants "no shared store configured" has to say so rather than inheriting
 * whichever fake client ran before it.
 */
export function resetSharedRedisClientForTests(): void {
  redis = null;
  ratelimitInstances.clear();
}

// Cache of created Ratelimit instances per limiter name to avoid
// creating a new instance on every request (which wastes CPU and
// may hit Upstash connection limits).
const ratelimitInstances = new Map<string, Ratelimit>();

function getRatelimitInstance(
  name: string,
  maxRequests: number,
  windowMs: number
): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;

  const key = `${name}:${maxRequests}:${windowMs}`;
  let instance = ratelimitInstances.get(key);
  if (!instance) {
    instance = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(
        maxRequests,
        `${Math.round(windowMs / 1000)} s`
      ),
      prefix: `shipin:${name}`,
    });
    ratelimitInstances.set(key, instance);
  }
  return instance;
}

export function createSharedRateLimiter(
  name: string,
  maxRequests: number,
  windowMs: number,
  fallback: { record: (req: Request) => Promise<RateLimitResult> }
) {
  // Error counters are local *and* mirrored to Redis, so /api/health reports
  // the same totals from every instance. The local map stays the fallback for
  // when the store itself is unavailable.
  const errorCounters = new Map<
    string,
    { errors: number; lastErrorAt: number }
  >();

  function bumpCounter(key: string): void {
    const now = Date.now();
    const prev = errorCounters.get(key) ?? { errors: 0, lastErrorAt: 0 };
    const next = { errors: prev.errors + 1, lastErrorAt: now };
    errorCounters.set(key, next);
    reportRedisError(name, key);
    // The push side of the same signal: counters and /api/health are pull
    // signals; this pages an operator once the outage is sustained.
    maybeEscalateStoreOutage(name);

    const client = getRedis();
    if (client) {
      // Fire and forget: health reporting must never delay or fail a request.
      void client
        .hset(ERROR_HASH_PREFIX + name, { [key]: JSON.stringify(next) })
        .then(() =>
          client.expire(ERROR_HASH_PREFIX + name, ERROR_HASH_TTL_SECONDS)
        )
        .catch(() => {
          /* counters are best effort */
        });
    }
  }

  return {
    async record(request: Request): Promise<RateLimitResult> {
      if (isRateLimitingDisabled()) {
        // Deliberately permissive rather than throwing: callers still publish
        // the headers they would for an allowed request.
        return {
          ok: true,
          limit: maxRequests,
          remaining: maxRequests,
          reset: Date.now() + windowMs,
        };
      }

      // One derivation, shared with the in-memory limiter and the ceiling
      // below; see `rateLimitSubject.ts` for why a token buys its own bucket.
      const subject = await resolveRateLimitSubject(request);

      const limiter = getRatelimitInstance(name, maxRequests, windowMs);
      if (!limiter) {
        if (isProduction && !isRateLimitStoreOptional()) {
          // No shared store configured in production — this is a hard failure.
          // A financial application cannot operate with per-instance rate limits
          // that an attacker can bypass by spreading requests across regions.
          // The startup validator (validateProductionRequiredEnv) already throws
          // if the store is missing without the E2E opt-out, so this should
          // never be reached in a valid production deployment. We throw here
          // as a defense-in-depth measure.
          const err = new Error(
            `[RateLimiter:${name}] UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN are not configured in production. ` +
              `Rate limiting requires a shared store. Set both variables, or set ${RATE_LIMIT_STORE_OPTIONAL_ENV}=1 only for the E2E suite.`
          );
          console.error(err.message);
          throw err;
        }

        // Development/test, or a production build carrying the documented E2E
        // opt-out: use the per-instance in-memory fallback. The opt-out has to
        // be honoured here and not only by the startup validator, otherwise the
        // process boots and then answers 500 to every request while
        // /api/health reports the deployment as down. Health still reports
        // `degraded` for this deployment, which is the alert an operator acts
        // on; `reportRateLimitStoreStatus` is what records it.
        return fallback.record(request);
      }

      try {
        if (subject.kind === "ip") {
          const result = await limiter.limit(subject.key);

          return {
            ok: result.success,
            limit: maxRequests,
            remaining: result.remaining,
            reset: result.reset,
          };
        }

        /*
         * Authenticated request: the account has its own budget, and the
         * address keeps a ceiling so that minting a token per request (the
         * `sub` here is decoded, not verified) cannot turn a per-account limit
         * into no limit at all.
         */
        const ceilingLimit = maxRequests * TOKEN_IP_CEILING_MULTIPLIER;
        const ceilingLimiter = getRatelimitInstance(
          `${name}:ip-ceiling`,
          ceilingLimit,
          windowMs
        );

        const [account, address] = await Promise.all([
          limiter.limit(subject.key),
          ceilingLimiter ? ceilingLimiter.limit(`ip:${subject.ip}`) : null,
        ]);

        if (!account.success) {
          return {
            ok: false,
            limit: maxRequests,
            remaining: account.remaining,
            reset: account.reset,
          };
        }

        if (address && !address.success) {
          return {
            ok: false,
            limit: ceilingLimit,
            remaining: 0,
            reset: address.reset,
          };
        }

        return {
          ok: true,
          limit: maxRequests,
          remaining: account.remaining,
          reset: account.reset,
        };
      } catch (error) {
        // Fail OPEN, but flagged: an outage must not lock every user out (see
        // the `unavailable` branch in proxy.ts), so the request is served. The
        // gap is not silent — this is counted, logged and reported as
        // `degraded` by /api/health, which is the alert an operator acts on.
        bumpCounter(subject.key);
        console.error(
          `[RateLimiter:${name}] Redis call failed, serving request without a limit (degraded):`,
          error instanceof Error ? error.message : error
        );
        return {
          ok: false,
          unavailable: true,
          limit: maxRequests,
          remaining: 0,
          reset: Date.now() + windowMs,
        };
      }
    },

    /**
     * Expose per-limiter Redis error counts so callers can surface them
     * in health checks or observability dashboards. Keys are rate-limit
     * subjects (`u:<uid>` or `ip:<address>`).
     * Callers should pass {{Date.now() - 5 * 60 * 1000}} as |since| to
     * get only recent errors (last 5 minutes).
     */
    async getErrorCounts(
      since: number
    ): Promise<Array<{ ip: string; errors: number; lastErrorAt: number }>> {
      const merged = new Map(errorCounters);
      const client = getRedis();

      if (client) {
        try {
          const stored = await client.hgetall<Record<string, unknown>>(
            ERROR_HASH_PREFIX + name
          );

          for (const [ip, raw] of Object.entries(stored ?? {})) {
            const parsed =
              typeof raw === "string"
                ? (JSON.parse(raw) as {
                    errors?: unknown;
                    lastErrorAt?: unknown;
                  })
                : (raw as { errors?: unknown; lastErrorAt?: unknown });

            const errors = Number(parsed?.errors);
            const lastErrorAt = Number(parsed?.lastErrorAt);
            if (!Number.isFinite(errors) || !Number.isFinite(lastErrorAt))
              continue;

            const existing = merged.get(ip);
            merged.set(ip, {
              errors: Math.max(errors, existing?.errors ?? 0),
              lastErrorAt: Math.max(lastErrorAt, existing?.lastErrorAt ?? 0),
            });
          }
        } catch {
          // Keep the local counts; a store failure must not blank the health view.
        }
      }

      return Array.from(merged.entries())
        .filter(([, v]) => v.lastErrorAt >= since)
        .map(([ip, v]) => ({ ip, ...v }));
    },
  };
}
