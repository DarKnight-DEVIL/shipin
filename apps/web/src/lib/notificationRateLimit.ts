/**
 * Per-user notification rate limit.
 *
 * Notification sends are triggered by events — payments, shipment updates, a
 * tracking sync that touches every open parcel — so a burst can fan out into
 * hundreds of messages for one customer. A Redis INCR with a one-hour window
 * bounds that per user across instances; when no shared store is configured the
 * limit falls back to this process's memory, which still stops a single cron run
 * from flooding one inbox.
 */

import { getSharedRedisClient } from "@/lib/redisRateLimiter";

export const NOTIFICATION_RATE_LIMIT = 10;
export const NOTIFICATION_RATE_WINDOW_MS = 60 * 60 * 1000;

const REDIS_PREFIX = "shipin:notifrate:";

/** Fallback buckets: userId -> send timestamps inside the window. */
const localBuckets = new Map<string, number[]>();

function pruneLocal(now: number): void {
  const cutoff = now - NOTIFICATION_RATE_WINDOW_MS;

  for (const [userId, stamps] of localBuckets) {
    const recent = stamps.filter((stamp) => stamp > cutoff);
    if (recent.length > 0) localBuckets.set(userId, recent);
    else localBuckets.delete(userId);
  }
}

/**
 * Record an attempt and report whether it is within the limit.
 *
 * Fails open on a store error: dropping a legitimate "your parcel shipped"
 * message is worse than an extra notification during an outage.
 */
export async function allowNotification(
  userId: string,
  now: number = Date.now()
): Promise<boolean> {
  const client = getSharedRedisClient();

  if (client) {
    try {
      const key = `${REDIS_PREFIX}${userId}`;
      const count = await client.incr(key);

      if (count === 1) {
        await client.expire(key, Math.floor(NOTIFICATION_RATE_WINDOW_MS / 1000));
      }

      return count <= NOTIFICATION_RATE_LIMIT;
    } catch {
      // Fall through to the in-process bucket.
    }
  }

  const cutoff = now - NOTIFICATION_RATE_WINDOW_MS;
  const recent = (localBuckets.get(userId) ?? []).filter((stamp) => stamp > cutoff);

  if (recent.length >= NOTIFICATION_RATE_LIMIT) {
    localBuckets.set(userId, recent);
    return false;
  }

  recent.push(now);
  localBuckets.set(userId, recent);

  // Bound the map without a timer: one sweep when it grows large.
  if (localBuckets.size > 5_000) pruneLocal(now);

  return true;
}

/** Test hook: forget every in-process bucket. */
export function resetNotificationRateLimit(): void {
  localBuckets.clear();
}
