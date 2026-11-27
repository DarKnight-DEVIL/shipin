/**
 * Server-side tracking of outbound rate-limit rejections.
 *
 * A per-recipient token bucket refuses sends when one address is being
 * flooded — by an abusive caller, a loop, or a misconfigured flow. Each
 * refusal is invisible to the recipient (the mail simply does not arrive),
 * so an operator has no signal unless the rejections are counted somewhere:
 * this module counts them and /api/health surfaces them as `degraded` when
 * they spike, with one Discord webhook alert per outage window.
 *
 * Counts live in the shared Redis store (the same client the rate limiters
 * use), one counter per channel and five-minute bucket
 * (`shipin:outbound:rejections:{channel}:{bucket}`, 30-minute TTL), so the
 * hash cannot grow. Without a store the module falls back to per-instance
 * memory — weaker across serverless instances, but the health probe still
 * sees what its own instance observed.
 */
import "server-only";

import { childLogger } from "./logger";
import { getSharedRedisClient } from "./redisRateLimiter";

const BUCKET_MS = 5 * 60 * 1000;
/** Current bucket plus the one before it: a ten-minute view. */
const WINDOW_BUCKETS = 2;
const KEY_TTL_SECONDS = 30 * 60;
const KEY_PREFIX = "shipin:outbound:rejections";

/**
 * Combined rejections (both channels) above this within the window mark the
 * deployment degraded. A flood trips this within seconds; the occasional
 * throttled resend stays under it.
 */
export const OUTBOUND_SPIKE_THRESHOLD = 10;

const logger = childLogger({ service: "outbound-metrics" });

export type OutboundChannel = "email" | "whatsapp";

const CHANNELS: OutboundChannel[] = ["email", "whatsapp"];

function currentBucket(now = Date.now()): number {
  return Math.floor(now / BUCKET_MS);
}

/** In-memory fallback, used only when no shared store is configured. */
const localBuckets = new Map<OutboundChannel, Map<number, number>>();

function pruneLocalBuckets(now = Date.now()): void {
  const oldest = currentBucket(now) - WINDOW_BUCKETS;
  for (const buckets of localBuckets.values()) {
    for (const bucket of buckets.keys()) {
      if (bucket < oldest) buckets.delete(bucket);
    }
  }
}

function redisKey(channel: OutboundChannel, bucket: number): string {
  return `${KEY_PREFIX}:${channel}:${bucket}`;
}

/**
 * Count one OUTBOUND_RATE_LIMITED refusal. Fire-and-forget in the same sense
 * as the App Check counter: the refusal path in the senders must never wait
 * on — or fail because of — the counter, so the Redis writes are not awaited
 * and their failures are only logged.
 */
export function recordOutboundRejection(
  channel: OutboundChannel,
  now = Date.now()
): void {
  const bucket = currentBucket(now);
  const key = redisKey(channel, bucket);

  const client = getSharedRedisClient();
  if (client) {
    // Two independent writes, not a chain: the caller is a refused send that
    // must not wait on the counter, and a chain would put the TTL behind the
    // first write's latency.
    const warn = (error: unknown) =>
      logger.warn(
        "Could not record an outbound rejection in the shared store",
        { error: error instanceof Error ? error.message : String(error) }
      );

    void client.incrby(key, 1).catch(warn);
    void client.expire(key, KEY_TTL_SECONDS).catch(warn);
  }

  const buckets = localBuckets.get(channel) ?? new Map<number, number>();
  buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  localBuckets.set(channel, buckets);
  pruneLocalBuckets(now);
}

export interface OutboundRejectionStatus {
  /** Rejections across both channels in the ten-minute window. */
  rejectionsLast10Min: number;
  /** The same, split by channel. */
  byChannel: Record<OutboundChannel, number>;
  /** True when the combined count crosses the spike threshold. */
  spike: boolean;
}

/**
 * Sum the last ten minutes of rejections, per channel and combined.
 *
 * Reads the shared store when it is configured; on a store error it falls
 * back to the local counters rather than reporting a false zero.
 */
export async function readOutboundRejections(
  now = Date.now()
): Promise<OutboundRejectionStatus> {
  const oldest = currentBucket(now) - (WINDOW_BUCKETS - 1);
  const byChannel: Record<OutboundChannel, number> = { email: 0, whatsapp: 0 };

  const client = getSharedRedisClient();
  if (client) {
    try {
      for (const channel of CHANNELS) {
        for (let bucket = oldest; bucket <= currentBucket(now); bucket += 1) {
          const raw = await client.get(redisKey(channel, bucket));
          byChannel[channel] += Number(raw) || 0;
        }
      }

      const rejectionsLast10Min =
        byChannel.email + byChannel.whatsapp;
      return {
        rejectionsLast10Min,
        byChannel,
        spike: rejectionsLast10Min >= OUTBOUND_SPIKE_THRESHOLD,
      };
    } catch (error) {
      logger.warn(
        "Could not read outbound rejections from the shared store",
        { error: error instanceof Error ? error.message : String(error) }
      );
      // Fall through to the local counters rather than reporting a false zero.
    }
  }

  pruneLocalBuckets(now);
  for (const channel of CHANNELS) {
    for (const [bucket, count] of localBuckets.get(channel) ?? []) {
      if (bucket >= oldest) byChannel[channel] += count;
    }
  }

  const rejectionsLast10Min = byChannel.email + byChannel.whatsapp;
  return {
    rejectionsLast10Min,
    byChannel,
    spike: rejectionsLast10Min >= OUTBOUND_SPIKE_THRESHOLD,
  };
}

// --- Discord webhook alerting ---------------------------------------------

let lastAlertedBucket = -1;

/**
 * Where the alert goes.
 *
 * Read straight from `process.env` rather than `serverEnv`: the webhook is
 * optional, and `process.env` keeps working when the env module is stubbed
 * (the shared test setup replaces it with a static object that would make
 * this silently unusable). The outbound flood reuses the App Check alert
 * channel — the same on-call watches both — and falls back to the breach
 * channel for deployments that only run that one.
 */
export function resolveOutboundAlertWebhookUrl(): string | null {
  const dedicated = process.env.APP_CHECK_ALERT_WEBHOOK_URL?.trim();
  if (dedicated) return dedicated;

  const fallback = process.env.BREACH_ALERT_WEBHOOK_URL?.trim();
  return fallback || null;
}

/** Discord embed side-stripe: the brand orange, matching the other alerts. */
const EMBED_COLOR = 0xff6b1a;
const ALERT_TIMEOUT_MS = 5000;

/** The deployment name Discord should show; Vercel sets VERCEL_ENV. */
function deploymentEnvironment(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "unknown"
  );
}

export interface OutboundAlertPayload {
  content: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
  }>;
}

export function buildOutboundAlertPayload(
  status: OutboundRejectionStatus,
  now = Date.now()
): OutboundAlertPayload {
  const environment = deploymentEnvironment();

  return {
    content: `🚨 **Outbound Send Spike Detected** — ${status.rejectionsLast10Min} rate-limited sends in the last 10 minutes (${environment})`,
    embeds: [
      {
        title: "Outbound Send Spike Detected",
        description:
          "The per-recipient outbound token buckets are refusing sends — one address is being " +
          "flooded by a caller, a loop, or a misconfigured flow. Recipients see silence, not an " +
          "error, so this probe is the signal.",
        color: EMBED_COLOR,
        fields: [
          {
            name: "Rejections (10 min)",
            value: String(status.rejectionsLast10Min),
            inline: true,
          },
          { name: "Email", value: String(status.byChannel.email), inline: true },
          {
            name: "WhatsApp",
            value: String(status.byChannel.whatsapp),
            inline: true,
          },
          {
            name: "Spike threshold",
            value: String(OUTBOUND_SPIKE_THRESHOLD),
            inline: true,
          },
          { name: "Environment", value: environment, inline: true },
          {
            name: "Remediation",
            value:
              "Find the caller in the logs by its `OUTBOUND_RATE_LIMITED` errors and stop the " +
              "loop or fix the flow. The buckets refill on their own; no restart is needed.",
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
export async function dispatchOutboundAlert(
  payload: OutboundAlertPayload
): Promise<void> {
  const url = resolveOutboundAlertWebhookUrl();
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn("Outbound alert webhook rejected the payload", {
        // Status only: the URL is a credential, so it never reaches the logs.
        status: response.status,
      });
    }
  } catch (error) {
    logger.warn("Outbound alert webhook could not be reached", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const defaultAlertSender: (payload: OutboundAlertPayload) => void = (
  payload
) => {
  void dispatchOutboundAlert(payload);
};

let sendAlert: (payload: OutboundAlertPayload) => void = defaultAlertSender;

/** Test hook: replace the alert sender (reset by resetOutboundMetricsForTests). */
export function setOutboundAlertSenderForTests(
  sender: (payload: OutboundAlertPayload) => void
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
export function reportOutboundSpike(
  status: OutboundRejectionStatus,
  now = Date.now()
): boolean {
  if (!status.spike) return false;

  const bucket = currentBucket(now);
  if (bucket <= lastAlertedBucket) return false;
  lastAlertedBucket = bucket;

  sendAlert(buildOutboundAlertPayload(status, now));
  return true;
}

/** Test hook: reset the dedupe state, local counters, and alert sender. */
export function resetOutboundMetricsForTests(): void {
  for (const buckets of localBuckets.values()) buckets.clear();
  localBuckets.clear();
  lastAlertedBucket = -1;
  sendAlert = defaultAlertSender;
}
