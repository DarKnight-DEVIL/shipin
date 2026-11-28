/**
 * Client-side error intake.
 *
 * Browser errors are the blind spot on the server: `global-error` renders a
 * fallback, and then the exception goes nowhere. Sending every report straight
 * to the reporter would page the operator for every user with an ad blocker
 * tripping a script, so a single fingerprint alerts only after it repeats
 * often enough to be a pattern (see `spike` below). Everything is counted
 * per-instance: a report is a signal, not a record that has to be exact.
 *
 * Deliberately not persisted: the rate limiter already bounds the traffic, the
 * log line carries the detail, and nothing here is worth a Firestore write per
 * browser exception.
 */

import { captureServerError } from "./errorTracking";
import { logger } from "./logger";
import { stableHash } from "./stableHash";

/** Reports of one fingerprint inside a window before it becomes an alert. */
export const CLIENT_ERROR_ALERT_THRESHOLD = 20;
export const CLIENT_ERROR_WINDOW_MS = 10 * 60 * 1000;
/** One alert per fingerprint per this long, however many reports arrive. */
export const CLIENT_ERROR_ALERT_DEDUPE_MS = 30 * 60 * 1000;

interface Counter {
  windowStart: number;
  count: number;
  alertedAt?: number;
}

const counters = new Map<string, Counter>();

export function resetClientErrorMetricsForTests(): void {
  counters.clear();
}

export interface ClientErrorInput {
  message: string;
  path: string;
  digest?: string;
  stack?: string;
}

export async function recordClientError(input: ClientErrorInput): Promise<void> {
  const fingerprint = stableHash(`${input.message}|${input.path}`).slice(0, 16);
  const now = Date.now();
  const counter = counters.get(fingerprint) ?? { windowStart: now, count: 0 };

  if (now - counter.windowStart > CLIENT_ERROR_WINDOW_MS) {
    counter.windowStart = now;
    counter.count = 0;
  }

  counter.count += 1;
  counters.set(fingerprint, counter);

  // Every report is visible in the logs; only the pattern pages anyone.
  logger.warn("[client] uncaught error", {
    service: "client-errors",
    fingerprint,
    path: input.path,
    digest: input.digest,
    count: counter.count,
  });

  const dueForAlert =
    counter.count >= CLIENT_ERROR_ALERT_THRESHOLD &&
    (counter.alertedAt === undefined ||
      now - counter.alertedAt > CLIENT_ERROR_ALERT_DEDUPE_MS);

  if (!dueForAlert) return;

  counter.alertedAt = now;

  await captureServerError(
    new Error(input.message.slice(0, 200)),
    {
      category: "client-error",
      severity: "warning",
      code: "CLIENT_ERROR",
      // The stack is for the log, not the fingerprint: two users on the same
      // broken screen should raise one alert, not one each.
      fingerprint: `client-error:${fingerprint}`,
      context: {
        path: input.path,
        reports: counter.count,
        digest: input.digest,
      },
    }
  );
}
