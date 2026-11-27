/**
 * Per-recipient token bucket for outbound messages.
 *
 * The per-user notification limit (`notificationRateLimit`) bounds what one
 * account triggers through the notification service. It does not cover the
 * senders' other callers — the verification resend, the support email route,
 * compliance mail — and it keys on userId, not on the address a message
 * actually goes to. This module is the last gate before the provider: one
 * token bucket per recipient address (email or phone), shared across
 * instances through Redis, so no caller can point a burst at one inbox or
 * one phone number.
 *
 * A token bucket rather than a fixed window: legitimate traffic to one
 * recipient is bursty (a password reset followed by two notifications), so
 * the bucket allows a burst up to its capacity and then refills smoothly,
 * instead of refusing message number eleven in an hour that held ten.
 *
 * Behavior:
 *   - With the shared store configured, buckets live in Redis (Upstash token
 *     bucket) and hold across serverless instances.
 *   - Without a store (development, test), buckets are this process's memory.
 *   - If a Redis call fails, the send is ALLOWED. This is the opposite of
 *     `notificationRateLimit`'s fail-closed, on purpose: that limit protects
 *     one customer from a flood and can afford to drop a message, while this
 *     one stands between every caller and the mail provider — failing closed
 *     here turns a Redis outage into a full outbound outage, including
 *     password resets. The proxy limiter makes the same trade (fail-open on
 *     store unavailability).
 */

import { Ratelimit } from "@upstash/ratelimit";

import { childLogger } from "@/lib/logger";
import { recordOutboundRejection } from "@/lib/outboundMetrics";
import {
  getSharedRedisClient,
  resetSharedRedisClientForTests,
} from "@/lib/redisRateLimiter";

const outboundLog = childLogger({ service: "outbound-rate-limit" });

/** Burst capacity per recipient: the most a single moment may send. */
export const OUTBOUND_MAX_TOKENS = 10;

/** One token every six minutes — the same 10/hour sustained as the burst. */
export const OUTBOUND_REFILL_INTERVAL_MS = 6 * 60 * 1000;

const REDIS_PREFIX = "shipin:outbound:";

export type OutboundChannel = "email" | "whatsapp";

interface LocalBucket {
  tokens: number;
  lastRefillAt: number;
}

/** Fallback buckets: `${channel}:${recipient}` -> token state. */
const localBuckets = new Map<string, LocalBucket>();

/** One Ratelimit per channel, created once (see redisRateLimiter's note). */
const ratelimitInstances = new Map<OutboundChannel, Ratelimit>();

function ratelimitFor(channel: OutboundChannel): Ratelimit | null {
  const client = getSharedRedisClient();
  if (!client) return null;

  let instance = ratelimitInstances.get(channel);
  if (!instance) {
    instance = new Ratelimit({
      redis: client,
      limiter: Ratelimit.tokenBucket(
        1,
        `${Math.round(OUTBOUND_REFILL_INTERVAL_MS / 1000)} s`,
        OUTBOUND_MAX_TOKENS
      ),
      prefix: `${REDIS_PREFIX}${channel}`,
    });
    ratelimitInstances.set(channel, instance);
  }

  return instance;
}

/**
 * Consume one token from the recipient's bucket.
 *
 * The in-memory path takes `now` so tests can walk the clock; the Redis path
 * keeps its own time, as the store's token bucket does the refilling.
 */
async function consume(
  channel: OutboundChannel,
  recipientKey: string,
  now: number
): Promise<boolean> {
  const ratelimit = ratelimitFor(channel);

  if (ratelimit) {
    try {
      const { success } = await ratelimit.limit(recipientKey);
      return success;
    } catch (error) {
      // Fail open: see the module docblock. Logged so /api/health's degraded
      // state has a visible cause in the send path too.
      outboundLog.error(
        "Outbound rate-limit store unavailable; allowing the send",
        { errorCode: error instanceof Error ? error.name : "UNKNOWN" }
      );
      return true;
    }
  }

  const key = `${channel}:${recipientKey}`;
  const bucket = localBuckets.get(key);
  const elapsed = bucket ? now - bucket.lastRefillAt : 0;
  const refilled = bucket
    ? Math.min(
        OUTBOUND_MAX_TOKENS,
        bucket.tokens + elapsed / OUTBOUND_REFILL_INTERVAL_MS
      )
    : OUTBOUND_MAX_TOKENS;

  // A refused send spends no token: the bucket stays where the refill put it.
  // The refusal is also the metric event — /api/health watches a spike of
  // these, since a flooded recipient sees silence rather than an error.
  if (refilled < 1) {
    localBuckets.set(key, { tokens: refilled, lastRefillAt: now });
    recordOutboundRejection(channel, now);
    return false;
  }

  localBuckets.set(key, { tokens: refilled - 1, lastRefillAt: now });
  pruneLocal();
  return true;
}

/** One bucket key per address: case and formatting must not split the bucket. */
export function normalizeEmailRecipient(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only, the same shape the WhatsApp API call uses. */
export function normalizePhoneRecipient(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Whether one more email to this address may leave. Empty addresses are
 * allowed through: bounding a recipient that does not exist is meaningless,
 * and address validation is the caller's job.
 */
export async function allowOutboundEmail(
  email: string,
  now: number = Date.now()
): Promise<boolean> {
  const key = normalizeEmailRecipient(email);
  if (!key) return true;
  return consume("email", key, now);
}

/** Whether one more WhatsApp message to this number may leave. */
export async function allowOutboundWhatsApp(
  phone: string,
  now: number = Date.now()
): Promise<boolean> {
  const key = normalizePhoneRecipient(phone);
  if (!key) return true;
  return consume("whatsapp", key, now);
}

/**
 * Bound the fallback map without a timer: when it grows large, drop idle
 * (full) buckets first, then the oldest. Real traffic refreshes its own
 * entry, so the oldest entries are the ones nobody is writing to.
 */
function pruneLocal(): void {
  if (localBuckets.size <= 5_000) return;

  for (const [key, bucket] of localBuckets) {
    if (localBuckets.size <= 4_000) break;
    if (bucket.tokens >= OUTBOUND_MAX_TOKENS) localBuckets.delete(key);
  }

  while (localBuckets.size > 4_000) {
    const oldest = localBuckets.keys().next().value;
    if (oldest === undefined) break;
    localBuckets.delete(oldest);
  }
}

/**
 * Test hook: forget every in-process bucket and the shared store.
 *
 * Cleared through this module's own import rather than by the test importing
 * `redisRateLimiter` directly: the suite runs with `isolate: false` and files
 * that call `vi.resetModules()` can leave a second instance behind, so
 * clearing that one would not touch the client used here.
 */
export function resetOutboundRateLimit(): void {
  localBuckets.clear();
  ratelimitInstances.clear();
  resetSharedRedisClientForTests();
}
