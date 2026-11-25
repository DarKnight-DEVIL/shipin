/**
 * Server-side tracking of App Check rejections.
 *
 * When the reCAPTCHA Enterprise quota runs out (or attestation breaks for any
 * other reason), every API request starts failing with APP_CHECK_FAILED at
 * once. Each user sees a banner, but an operator has no signal — so the
 * rejection count is aggregated here and surfaced by /api/health as
 * `degraded`, with a Sentry alert when the rate crosses the spike threshold.
 *
 * Counts live in the shared Redis store (the same client the rate limiters
 * use), bucketed at five minutes: a spike is judged over a ten-minute window,
 * and old buckets expire so the hash cannot grow. Without a store the module
 * falls back to per-instance memory — weaker across serverless instances, but
 * the health probe still sees what its own instance observed.
 */
import "server-only";

import { childLogger } from "./logger";
import { getSharedRedisClient } from "./redisRateLimiter";

const REJECTION_HASH = "shipin:appcheck:rejections";
const BUCKET_MS = 5 * 60 * 1000;
/** Current bucket plus the one before it: a ten-minute view. */
const WINDOW_BUCKETS = 2;
const HASH_TTL_SECONDS = 30 * 60;
/**
 * Rejections above this within the window mark the deployment degraded. A
 * quota outage trips this within seconds — every user's next request fails —
 * while isolated attestation hiccups (one user, stale token) stay under it.
 */
export const APP_CHECK_SPIKE_THRESHOLD = 20;

const logger = childLogger({ service: "appcheck-metrics" });

function currentBucket(now = Date.now()): number {
  return Math.floor(now / BUCKET_MS);
}

/** In-memory fallback, used only when no shared store is configured. */
const localBuckets = new Map<number, number>();

function pruneLocalBuckets(now = Date.now()): void {
  const oldest = currentBucket(now) - WINDOW_BUCKETS;
  for (const bucket of localBuckets.keys()) {
    if (bucket < oldest) localBuckets.delete(bucket);
  }
}

/**
 * Count one APP_CHECK_FAILED rejection. Fire-and-forget: the rejection path in
 * the auth gates must never wait on — or fail because of — the counter.
 */
export function recordAppCheckRejection(now = Date.now()): void {
  const bucket = currentBucket(now);

  const client = getSharedRedisClient();
  if (client) {
    void client
      .hincrby(REJECTION_HASH, String(bucket), 1)
      .then(() => client.expire(REJECTION_HASH, HASH_TTL_SECONDS))
      .catch((error: unknown) => {
        logger.warn(
          "Could not record an App Check rejection in the shared store",
          { error: error instanceof Error ? error.message : String(error) }
        );
      });
  }

  localBuckets.set(bucket, (localBuckets.get(bucket) ?? 0) + 1);
  pruneLocalBuckets(now);
}

export interface AppCheckRejectionStatus {
  /** Rejections across the ten-minute window. */
  recentRejections: number;
  /** True when recentRejections crosses the spike threshold. */
  spike: boolean;
}

export async function readAppCheckRejections(
  now = Date.now()
): Promise<AppCheckRejectionStatus> {
  const oldest = currentBucket(now) - (WINDOW_BUCKETS - 1);
  let total = 0;

  const client = getSharedRedisClient();
  if (client) {
    try {
      const stored = await client.hgetall<Record<string, unknown>>(
        REJECTION_HASH
      );
      for (const [bucket, raw] of Object.entries(stored ?? {})) {
        if (Number(bucket) < oldest) continue;
        total += Number(raw) || 0;
      }
      return { recentRejections: total, spike: total >= APP_CHECK_SPIKE_THRESHOLD };
    } catch (error) {
      logger.warn(
        "Could not read App Check rejections from the shared store",
        { error: error instanceof Error ? error.message : String(error) }
      );
      // Fall through to the local counters rather than reporting a false zero.
    }
  }

  pruneLocalBuckets(now);
  for (const [bucket, count] of localBuckets) {
    if (bucket >= oldest) total += count;
  }
  return { recentRejections: total, spike: total >= APP_CHECK_SPIKE_THRESHOLD };
}

// --- Sentry alerting -------------------------------------------------------

let lastAlertedBucket = -1;

/**
 * Sends one alert. Production routes it through Sentry (already part of the
 * server bundle via instrumentation); tests inject a recorder, because the
 * shared module registry makes mocking "@sentry/nextjs" unreliable.
 */
const defaultAlertSender: (message: string) => void = (message) => {
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        scope.setTag("service", "appcheck");
        scope.setLevel("warning");
        Sentry.captureMessage(message, "warning");
      });
    })
    .catch(() => {
      // A Sentry transport failure must not break the health probe.
    });
};

let sendAlert: (message: string) => void = defaultAlertSender;

/** Test hook: replace the alert sender (reset by resetAppCheckMetricsForTests). */
export function setAppCheckAlertSenderForTests(
  sender: (message: string) => void
): void {
  sendAlert = sender;
}

/**
 * Fire a Sentry alert when a spike is newly detected. Deduplicated per
 * five-minute bucket, because uptime monitors poll /api/health every few
 * seconds and one alert per outage is what an on-call wants — not hundreds.
 *
 * Returns true when this call sent the alert, which the health-route tests
 * assert against.
 */
export function reportAppCheckSpike(
  status: AppCheckRejectionStatus,
  now = Date.now()
): boolean {
  if (!status.spike) return false;

  const bucket = currentBucket(now);
  if (bucket <= lastAlertedBucket) return false;
  lastAlertedBucket = bucket;

  sendAlert(
    `[AppCheck] ${status.recentRejections} APP_CHECK_FAILED rejections in the last 10 minutes — ` +
      "clients cannot mint App Check tokens (reCAPTCHA quota exhausted or attestation broken). " +
      "Users can still sign in but every API call is rejected. " +
      "Escape hatch: set APP_CHECK_ENFORCEMENT=false and redeploy."
  );
  return true;
}

/** Test hook: reset the dedupe state, local counters, and alert sender. */
export function resetAppCheckMetricsForTests(): void {
  localBuckets.clear();
  lastAlertedBucket = -1;
  sendAlert = defaultAlertSender;
}
