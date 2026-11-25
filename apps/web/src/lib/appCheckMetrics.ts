/**
 * Server-side tracking of App Check rejections.
 *
 * When the reCAPTCHA Enterprise quota runs out (or attestation breaks for any
 * other reason), every API request starts failing with APP_CHECK_FAILED at
 * once. Each user sees a banner, but an operator has no signal — so the
 * rejection count is aggregated here and surfaced by /api/health as
 * `degraded`, with one Discord webhook alert when the rate crosses the spike
 * threshold.
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
/**
 * Why a request was refused, alongside the plain count above.
 *
 * "missing" means the browser sent no token at all - it could not mint one, so
 * the cause is client-side (reCAPTCHA blocked by an extension, the key's domain
 * list, a quota denial reaching the browser). "invalid" means it sent one and
 * the server refused it, so the cause is configuration: a key or project that
 * does not match this deployment. Those two need opposite fixes, and a single
 * total cannot tell them apart.
 */
const REASON_HASH = "shipin:appcheck:rejection-reasons";
/**
 * Which claim a refused token failed, by fixed label.
 *
 * Kept apart from the counts above because it answers a different question:
 * the count says clients are being refused, this says whether the fix is a
 * key registered in the wrong project or keys that could not be fetched.
 */
const DETAIL_HASH = "shipin:appcheck:invalid-details";
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
const localReasons = new Map<string, number>();
const localDetails = new Map<string, number>();

export type AppCheckRejectionReason = "missing" | "invalid";

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
export function recordAppCheckRejection(
  reason: AppCheckRejectionReason,
  now = Date.now()
): void {
  const bucket = currentBucket(now);
  const reasonField = `${bucket}:${reason}`;

  const client = getSharedRedisClient();
  if (client) {
    // Three independent writes, not a chain: the caller is a rejected request
    // that must not wait on the counter, and a chain would put the reason and
    // the TTL behind the first write's latency.
    const warn = (error: unknown) =>
      logger.warn("Could not record an App Check rejection in the shared store", {
        error: error instanceof Error ? error.message : String(error),
      });

    void client.hincrby(REJECTION_HASH, String(bucket), 1).catch(warn);
    void client.hincrby(REASON_HASH, reasonField, 1).catch(warn);
    void client.expire(REJECTION_HASH, HASH_TTL_SECONDS).catch(warn);
  }

  localBuckets.set(bucket, (localBuckets.get(bucket) ?? 0) + 1);
  localReasons.set(reasonField, (localReasons.get(reasonField) ?? 0) + 1);
  pruneLocalBuckets(now);
}

/**
 * Record why an invalid token failed verification: a fixed label, never the
 * token. Fire-and-forget, like the counter above.
 */
export function recordAppCheckFailureReason(
  detail: string,
  now = Date.now()
): void {
  const field = `${currentBucket(now)}:${detail}`;

  const client = getSharedRedisClient();
  if (client) {
    void client
      .hincrby(DETAIL_HASH, field, 1)
      .then(() => client.expire(DETAIL_HASH, HASH_TTL_SECONDS))
      .catch((error: unknown) => {
        logger.warn("Could not record an App Check failure reason", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  localDetails.set(field, (localDetails.get(field) ?? 0) + 1);
}

export interface AppCheckRejectionStatus {
  /** Rejections across the ten-minute window. */
  recentRejections: number;
  /** True when recentRejections crosses the spike threshold. */
  spike: boolean;
  /** Of the above, requests that carried no token at all. */
  missing: number;
  /** Of the above, requests that carried a token the server refused. */
  invalid: number;
  /** Why those tokens were refused, by label (e.g. audience-mismatch). */
  invalidReasons: Record<string, number>;
}

export async function readAppCheckRejections(
  now = Date.now()
): Promise<AppCheckRejectionStatus> {
  const oldest = currentBucket(now) - (WINDOW_BUCKETS - 1);
  let total = 0;
  let missing = 0;
  let invalid = 0;

  const invalidReasons: Record<string, number> = {};
  const countDetail = (field: string, raw: unknown) => {
    const [bucket, detail] = field.split(":");
    if (Number(bucket) < oldest) return;
    invalidReasons[detail] =
      (invalidReasons[detail] ?? 0) + (Number(raw) || 0);
  };

  const countReason = (field: string, raw: unknown) => {
    const [bucket, reason] = field.split(":");
    if (Number(bucket) < oldest) return;
    const count = Number(raw) || 0;
    if (reason === "missing") missing += count;
    else if (reason === "invalid") invalid += count;
  };

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
      const reasons = await client.hgetall<Record<string, unknown>>(REASON_HASH);
      const details = await client.hgetall<Record<string, unknown>>(DETAIL_HASH);
      for (const [field, raw] of Object.entries(details ?? {})) {
        countDetail(field, raw);
      }
      for (const [field, raw] of Object.entries(reasons ?? {})) {
        countReason(field, raw);
      }
      return {
        recentRejections: total,
        spike: total >= APP_CHECK_SPIKE_THRESHOLD,
        missing,
        invalid,
        invalidReasons,
      };
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
  for (const [field, count] of localReasons) {
    if (Number(field.split(":")[0]) >= oldest) countReason(field, count);
  }
  for (const [field, count] of localDetails) {
    countDetail(field, count);
  }
  return {
    recentRejections: total,
    spike: total >= APP_CHECK_SPIKE_THRESHOLD,
    missing,
    invalid,
    invalidReasons,
  };
}

// --- Discord webhook alerting ---------------------------------------------

let lastAlertedBucket = -1;

/**
 * Discord message payload: a short content line (so the notification preview
 * says what broke) plus one embed carrying the numbers and the fix.
 */
export interface AppCheckAlertPayload {
  content: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
  }>;
}

/** Discord embed side-stripe: the brand orange, matching the login surfaces. */
const EMBED_COLOR = 0xff6b1a;
const ALERT_TIMEOUT_MS = 5000;

/**
 * Where the alert goes.
 *
 * Read straight from `process.env` rather than `serverEnv`: the webhook is
 * optional, and `process.env` keeps working when the env module is stubbed
 * (the shared test setup replaces it with a static object that would make
 * this silently unusable).
 *
 * `APP_CHECK_ALERT_WEBHOOK_URL` is the dedicated channel; deployments that
 * only run the breach-alert channel fall back to it. Neither set means the
 * alert is a no-op — the health probe still reports `degraded`, which is the
 * signal that does not depend on any webhook being configured.
 */
export function resolveAppCheckAlertWebhookUrl(): string | null {
  const dedicated = process.env.APP_CHECK_ALERT_WEBHOOK_URL?.trim();
  if (dedicated) return dedicated;

  const fallback = process.env.BREACH_ALERT_WEBHOOK_URL?.trim();
  return fallback || null;
}

/**
 * Which channel a spike alert would use, if any.
 *
 * `/api/health` publishes this so an operator can see that the deployment has
 * no way to page anyone: the probe is then the only signal, and a monitor has
 * to watch it. The URL itself is a credential and is never reported.
 */
export function getAppCheckAlertTarget(): {
  configured: boolean;
  source: "dedicated" | "breach" | "none";
} {
  if (process.env.APP_CHECK_ALERT_WEBHOOK_URL?.trim()) {
    return { configured: true, source: "dedicated" };
  }
  if (process.env.BREACH_ALERT_WEBHOOK_URL?.trim()) {
    return { configured: true, source: "breach" };
  }
  return { configured: false, source: "none" };
}

/** The deployment name Discord should show; Vercel sets VERCEL_ENV. */
function deploymentEnvironment(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "unknown"
  );
}

export function buildAppCheckAlertPayload(
  status: AppCheckRejectionStatus,
  now = Date.now()
): AppCheckAlertPayload {
  const rejections = status.recentRejections;
  const environment = deploymentEnvironment();

  return {
    content: `🚨 **App Check Rejection Spike Detected** — ${rejections} rejections in the last 10 minutes (${environment})`,
    embeds: [
      {
        title: "App Check Rejection Spike Detected",
        description:
          "Clients cannot mint App Check tokens — reCAPTCHA quota exhausted or attestation broken. " +
          "Sign-in still works (it goes straight to Firebase Auth), but every API route is rejecting " +
          "requests with `APP_CHECK_FAILED`, so the app is unusable after login.",
        color: EMBED_COLOR,
        fields: [
          {
            name: "Rejections (10 min)",
            value: String(rejections),
            inline: true,
          },
          {
            name: "Spike threshold",
            value: String(APP_CHECK_SPIKE_THRESHOLD),
            inline: true,
          },
          { name: "Environment", value: environment, inline: true },
          {
            name: "Remediation",
            value:
              "Set `APP_CHECK_ENFORCEMENT=false` in Vercel and redeploy to restore service now. " +
              "Then attach billing to the Google Cloud project (reCAPTCHA Enterprise) and set it back to `true`.",
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
 * Never throws: /api/health calls this, and a slow or broken webhook must not
 * turn a degraded probe into a failed one. The 5s timeout bounds a hanging
 * Discord request; callers do not await it for the same reason.
 */
export async function dispatchAppCheckAlert(
  payload: AppCheckAlertPayload
): Promise<void> {
  const url = resolveAppCheckAlertWebhookUrl();
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn("App Check alert webhook rejected the payload", {
        // Status only: the URL is a credential, so it never reaches the logs.
        status: response.status,
      });
    }
  } catch (error) {
    logger.warn("App Check alert webhook could not be reached", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const defaultAlertSender: (payload: AppCheckAlertPayload) => void = (
  payload
) => {
  void dispatchAppCheckAlert(payload);
};

let sendAlert: (payload: AppCheckAlertPayload) => void = defaultAlertSender;

/** Test hook: replace the alert sender (reset by resetAppCheckMetricsForTests). */
export function setAppCheckAlertSenderForTests(
  sender: (payload: AppCheckAlertPayload) => void
): void {
  sendAlert = sender;
}

/**
 * Fire the webhook alert when a spike is newly detected. Deduplicated per
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

  sendAlert(buildAppCheckAlertPayload(status, now));
  return true;
}

/** Test hook: reset the dedupe state, local counters, and alert sender. */
export function resetAppCheckMetricsForTests(): void {
  localBuckets.clear();
  localReasons.clear();
  localDetails.clear();
  lastAlertedBucket = -1;
  sendAlert = defaultAlertSender;
}
