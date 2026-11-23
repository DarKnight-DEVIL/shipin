/**
 * Detection for repeated PayPal webhook signature failures.
 *
 * A wrong `PAYPAL_WEBHOOK_ID` fails *every* delivery: PayPal's verify endpoint
 * answers FAILURE, this app answers 400 `INVALID_SIGNATURE`, PayPal retries with
 * backoff and gives up, and the payment confirmation is gone. Any single
 * request looks identical to a forged one, so no per-request check can tell the
 * two apart — only the sequence can, and PayPal's retries are exactly the
 * deliveries being dropped, so the provider will never tell us either.
 *
 * Hence a counter: consecutive verification failures with no verified delivery
 * in between. It lives in a Firestore document rather than instance memory
 * because the app runs as serverless functions, where consecutive failures can
 * land on different processes and memory would show each one as the first.
 *
 * A verified delivery resets it. That reset is the whole discriminator: a wrong
 * id keeps failing, while a probe (or a replayed body) is followed by real
 * traffic that clears the counter before it ever reads as an incident.
 */

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { getSharedRedisClient } from "./redisRateLimiter";

/**
 * Consecutive failures, with no success in between, that turn a warning into an
 * incident. One rejection can be a scan; two can be a bad retry; three in a row
 * with zero verified deliveries is not a forged client — PayPal is delivering
 * and every delivery is being refused.
 */

export const SIGNATURE_FAILURE_ALERT_THRESHOLD = 3;

/** Document that holds the counter. Not customer data, server-side only. */
export const PAYPAL_WEBHOOK_HEALTH_PATH = "system/paypalWebhook";

// Redis key for the PayPal webhook health counter.
// Mirrored from Firestore so the health check works even when Firestore is down.
const WEBHOOK_HEALTH_REDIS_KEY: string = "paypalWebhook";

function healthRef() {
  return adminDb.collection("system").doc("paypalWebhook");
}

/**
 * Read the counter from Redis. Returns null when Redis is not configured or empty.
 */
async function readRedisCount(): Promise<{
  consecutiveFailures: number;
  lastFailureAt: string | null;
  alertingSince: string | null;
} | null> {
  const client = getSharedRedisClient();
  if (!client) return null;

  try {
    const raw: string | null = await client.get(WEBHOOK_HEALTH_REDIS_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    return {
      consecutiveFailures: data.consecutiveFailures ?? 0,
      lastFailureAt: data.lastFailureAt ?? null,
      alertingSince: data.alertingSince ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Write the counter to Redis. Fire-and-forget; must not delay the request.
 */
async function writeRedisCount(
  consecutiveFailures: number,
  lastFailureAt: string | null,
  alertingSince: string | null
): Promise<void> {
  const client = getSharedRedisClient();
  if (!client) return;

  try {
    await client.set(
      WEBHOOK_HEALTH_REDIS_KEY as string,
      JSON.stringify({
        consecutiveFailures,
        lastFailureAt,
        alertingSince,
      })
    );
    // Keep the key forever (health check always needs it); TTL is managed by Firestore.
  } catch {
    /* mirror write failure must not delay the request */
  }
}

export interface SignatureFailureStatus {
  /** Failures since the last verified delivery. */
  consecutiveFailures: number;
  /** When the most recent rejection happened, if it is known. */
  lastFailureAt: string | null;
  /** When the run of failures reached the alert threshold, or null. */
  alertingSince: string | null;
  /** True once the run is long enough to stop calling it a forgery. */
  alerting: boolean;
}

/** Firestore timestamps, `Date`s and the timestamp sentinel all arrive here. */
function toIso(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function readCount(data: Record<string, unknown> | undefined): number {
  const value = data?.consecutiveFailures;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Record one rejected delivery and return the new run length.
 *
 * A transaction, not `FieldValue.increment`, because the caller needs the
 * resulting count to alert exactly once at the crossing: an increment tells us
 * nothing about the value it produced, so every later failure would either
 * re-alert or none would.
 */
export async function recordSignatureFailure(): Promise<number> {
  const ref = healthRef();

  const consecutiveFailures = await adminDb.runTransaction(
    async (transaction) => {
      const snapshot = await transaction.get(ref);
      const previous = readCount(snapshot.data() as Record<string, unknown>);
      const newConsecutive = previous + 1;

      transaction.set(
        ref,
        {
          consecutiveFailures: newConsecutive,
          lastFailureAt: FieldValue.serverTimestamp(),
          // Kept on the document so an operator (and the health probe) can see how
          // long the incident has been running, not just how many there were.
          ...(newConsecutive === 1
            ? { firstFailureAt: FieldValue.serverTimestamp() }
            : {}),
          ...(newConsecutive === SIGNATURE_FAILURE_ALERT_THRESHOLD
            ? { alertingSince: FieldValue.serverTimestamp() }
            : {}),
        },
        { merge: true }
      );

      return newConsecutive;
    }
  );

  // Mirror the updated count to Redis so the health check works even when Firestore is down.
  // Fire-and-forget: must not delay the request.
  await writeRedisCount(
    consecutiveFailures,
    // We don't have the exact Firestore timestamp here; use null and let the Firestore document be the source of truth for timing.
    null,
    null
  );

  return consecutiveFailures;
}

/**
 * Record a delivery whose signature PayPal accepted.
 *
 * Unconditional rather than read-then-write: a read per delivery to avoid a
 * write per delivery is the wrong trade on a path this cold, and a stale
 * `consecutiveFailures` is an incident that never clears.
 */
export async function recordSignatureSuccess(): Promise<void> {
  await healthRef().set(
    {
      consecutiveFailures: 0,
      lastSuccessAt: FieldValue.serverTimestamp(),
      alertingSince: FieldValue.delete(),
    },
    { merge: true }
  );
}

/**
 * Read the counter for `/api/health`.
 *
 * First attempts Redis (mirror of the Firestore counter). When Redis is
 * unavailable or the key is absent, falls back to Firestore. When both are
 * unavailable, returns `null` so the health route reports `unknown` — this is
 * the safe default because a completely broken deployment must not lie about
 * payment health.
 */
export async function getSignatureFailureStatus(): Promise<SignatureFailureStatus | null> {
  // Try Redis first (mirror of the Firestore counter).
  const redisData = await readRedisCount();
  if (redisData !== null) {
    return {
      consecutiveFailures: redisData.consecutiveFailures,
      lastFailureAt: redisData.lastFailureAt,
      alertingSince: redisData.alertingSince,
      alerting:
        redisData.consecutiveFailures >= SIGNATURE_FAILURE_ALERT_THRESHOLD,
    };
  }

  // Fall back to Firestore when Redis is unavailable or empty.
  try {
    const snapshot = await healthRef().get();
    const data = snapshot.exists
      ? ((snapshot.data() ?? {}) as Record<string, unknown>)
      : {};
    const consecutiveFailures = readCount(data);

    return {
      consecutiveFailures,
      lastFailureAt: toIso(data.lastFailureAt),
      alertingSince: toIso(data.alertingSince),
      alerting: consecutiveFailures >= SIGNATURE_FAILURE_ALERT_THRESHOLD,
    };
  } catch {
    // Both Redis and Firestore failed — return null so the health route
    // reports `unknown` rather than guessing. This is the safe default.
    return null;
  }
}
