/**
 * Structured server-error tracking with alerting.
 *
 * The problem this solves: every failure in this app reached an operator the same
 * way — a line in the platform's log viewer, if anyone happened to look. The
 * three that matter most were invisible until a customer complained:
 *
 *   - payment drift: PayPal and Firestore disagree about a charge;
 *   - MFA denylist failures: a revoked admin session may still verify;
 *   - cron failures: the sweep that fixes the first two did not run.
 *
 * Each is captured here as a structured event, deduplicated per fingerprint and
 * pushed to the operator channel, and counted so /api/health can show the last
 * hour without anyone opening a dashboard.
 *
 * No vendor SDK. This deployment previously ran Sentry and removed it; the
 * operator channel is a Discord webhook shared with the App Check and breach
 * alerts. The sink is an adapter (`sendErrorAlert`) so replacing it later is a
 * change in this file only, not at every call site.
 *
 * Two rules, both learned the hard way elsewhere in this codebase:
 *   - capturing an error must never throw. A failure while reporting a failure
 *     turns one broken request into two.
 *   - the alert must never carry a credential. Context is stripped of anything
 *     key-shaped and truncated before it leaves the process.
 */

import "server-only";

import { childLogger } from "./logger";
import { getSharedRedisClient } from "./redisRateLimiter";
import { stableHash } from "./stableHash";

export type ErrorCategory =
  | "payment-drift"
  | "payment-settlement"
  | "mfa-store"
  | "cron"
  | "unhandled";

export type ErrorSeverity = "critical" | "error" | "warning";

export interface CaptureErrorOptions {
  category: ErrorCategory;
  severity?: ErrorSeverity;
  /** Stable machine code, e.g. `PAYPAL_AMOUNT_MISMATCH`. */
  code?: string;
  /** Non-secret context: ids, counts, statuses. */
  context?: Record<string, unknown>;
  /** Overrides the derived fingerprint when one incident has several messages. */
  fingerprint?: string;
}

export interface TrackedErrorEvent {
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
  fingerprint: string;
  context: Record<string, unknown>;
  occurredAt: string;
}

/** One alert per fingerprint per window: an outage must not page 400 times. */
const ALERT_COOLDOWN_SECONDS = 10 * 60;
/** Bucketed at five minutes, two buckets retained: a ten-minute view. */
const BUCKET_MS = 5 * 60 * 1000;
const WINDOW_BUCKETS = 2;
const COUNTER_HASH = "shipin:errors:counts";
const COUNTER_TTL_SECONDS = 30 * 60;
const ALERT_TIMEOUT_MS = 5000;
/** Context is bounded: an alert carrying a megabyte is not an alert. */
const MAX_CONTEXT_VALUE = 200;
const MAX_CONTEXT_KEYS = 12;
const MAX_MESSAGE = 500;

const logger = childLogger({ service: "error-tracking" });

/**
 * Keys whose values never belong in an alert.
 *
 * Matched as substrings, case-insensitively: `privateKey`, `authorization`,
 * `idToken`, `appCheckToken`, `clientSecret`, `password`, `cookie`, `card`.
 */
const SECRET_KEY_PATTERN =
  /(secret|token|password|passwd|authorization|cookie|apikey|api_key|private|credential|card|cvv)/i;

/**
 * Replace ids that make otherwise identical failures look distinct.
 *
 * Keeps fingerprints stable across requests: the point of deduplication is that
 * one broken code path alerts once, not once per request id.
 */
export function normaliseMessage(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\b[A-Za-z0-9]{20,}\b/g, "<id>")
    // Short ids carry a prefix and a mixed suffix (req_ABC123, user_7f3a). Pure
    // words are left alone: two different failures must not collapse into one
    // incident just because their messages look similar.
    .replace(/\b[A-Za-z0-9_-]*[A-Za-z][A-Za-z0-9_-]*[0-9][A-Za-z0-9_-]*\b/g, "<id>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** A stable identity for "this class of failure". */
export function fingerprintFor(
  category: ErrorCategory,
  code: string,
  message: string
): string {
  // Not a security primitive: a bucketing key that has to be identical in every
  // instance. `node:crypto` cannot appear anywhere in this module's graph - the
  // proxy and instrumentation are compiled for the edge runtime too, and the import
  // stops the production build.
  return `${category}:${stableHash(
    `${category}|${code}|${normaliseMessage(message)}`
  )}`;
}

function sanitiseContext(
  context: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!context) return {};

  const out: Record<string, unknown> = {};
  let count = 0;

  for (const [key, value] of Object.entries(context)) {
    if (count >= MAX_CONTEXT_KEYS) break;
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      count += 1;
      continue;
    }

    if (value === null || value === undefined) {
      out[key] = null;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (typeof value === "string") {
      out[key] = value.slice(0, MAX_CONTEXT_VALUE);
    } else if (Array.isArray(value)) {
      out[key] = `[${value.length} items]`;
    } else if (typeof value === "object") {
      out[key] = "[object]";
    } else {
      out[key] = String(value).slice(0, MAX_CONTEXT_VALUE);
    }

    count += 1;
  }

  return out;
}

/** Build the event that gets logged, counted and alerted. Pure, so it is tested. */
export function buildErrorEvent(
  error: unknown,
  options: CaptureErrorOptions
): TrackedErrorEvent {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  const code =
    options.code ??
    (error instanceof Error && typeof (error as { code?: unknown }).code === "string"
      ? ((error as unknown as { code: string }).code)
      : "UNKNOWN");

  return {
    category: options.category,
    severity: options.severity ?? "error",
    code,
    message: message.slice(0, MAX_MESSAGE),
    fingerprint:
      options.fingerprint ?? fingerprintFor(options.category, code, message),
    context: sanitiseContext(options.context),
    occurredAt: new Date().toISOString(),
  };
}

// --- operator channel ------------------------------------------------------

/**
 * The webhook an alert goes to.
 *
 * Read from `process.env` rather than `serverEnv`, like the App Check alert: the
 * env module is stubbed in tests and an alert that silently becomes a no-op there
 * is worse than one that is not configured at all.
 */
export function resolveErrorAlertWebhook(): string | null {
  const dedicated = process.env.ERROR_ALERT_WEBHOOK_URL?.trim();
  if (dedicated) return dedicated;

  const alert = process.env.ALERT_WEBHOOK_URL?.trim();
  if (alert) return alert;

  // The App Check channel is already wired to the operator's Discord in this
  // deployment. Falling back to it means error tracking works the day it ships,
  // instead of staying silent until someone adds a fourth variable.
  const appCheck = process.env.APP_CHECK_ALERT_WEBHOOK_URL?.trim();
  if (appCheck) return appCheck;

  const breach = process.env.BREACH_ALERT_WEBHOOK_URL?.trim();
  return breach || null;
}

export interface ErrorAlertPayload {
  content: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
  }>;
}

const SEVERITY_COLOR: Record<ErrorSeverity, number> = {
  critical: 0xd93025,
  error: 0xff6b1a,
  warning: 0xf2c744,
};

const CATEGORY_TITLE: Record<ErrorCategory, string> = {
  "payment-drift": "Payment drift needs a human",
  "payment-settlement": "A captured payment could not be settled",
  "mfa-store": "MFA revocation store failed",
  cron: "A scheduled job failed",
  unhandled: "Unhandled server error",
};

/**
 * Redact person-identifying and credential-shaped substrings from a message
 * before it leaves the process for the operator's Discord webhook.
 *
 * Unlike `normaliseMessage` — which erases every id and number so that
 * fingerprints stay stable — this keeps numbers and order ids readable (a
 * human is diagnosing from this text) and removes only what identifies a
 * person or authenticates something: email addresses, phone numbers and
 * bearer/JWT-shaped tokens. Raw error text can quote user input (a Firestore
 * or fetch error echoing an email, a URL carrying a token), and Discord is a
 * third party.
 */
export function redactMessageForAlert(message: string): string {
  return message
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    // E.164 (+countrycode…) or the grouped local shape 123-456-7890 /
    // 123 456 7890. Plain digit runs (timestamps, amounts, order numbers) are
    // left alone: they are diagnostic, not identifying.
    .replace(/\+\d{7,15}/g, "[phone]")
    .replace(/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/g, "[phone]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[token]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [token]");
}

/** The Discord message for one event. */
export function buildErrorAlertPayload(event: TrackedErrorEvent): ErrorAlertPayload {
  const fields: ErrorAlertPayload["embeds"][number]["fields"] = [
    { name: "Code", value: `\`${event.code}\``, inline: true },
    { name: "Severity", value: event.severity, inline: true },
    { name: "Category", value: event.category, inline: true },
  ];

  const contextLines = Object.entries(event.context)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`);

  if (contextLines.length > 0) {
    fields.push({ name: "Context", value: contextLines.join("\n").slice(0, 1000) });
  }

  return {
    content: `${CATEGORY_TITLE[event.category]} (${event.fingerprint})`,
    embeds: [
      {
        title: CATEGORY_TITLE[event.category],
        description: redactMessageForAlert(event.message).slice(0, 1500),
        color: SEVERITY_COLOR[event.severity],
        fields,
        timestamp: event.occurredAt,
      },
    ],
  };
}

/** Test hook: replace the transport. */
let sendAlert: (payload: ErrorAlertPayload, url: string) => Promise<void> = async (
  payload,
  url
) => {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    // A slow webhook must not hold the request open: this is fire-and-forget
    // reporting, and the error path is already expensive.
    signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
  });
};

export function setErrorAlertSenderForTests(
  sender: (payload: ErrorAlertPayload, url: string) => Promise<void>
): void {
  sendAlert = sender;
}

// --- counting --------------------------------------------------------------

const localCounts = new Map<string, number>();
/** Fingerprints already alerted on this instance, when there is no shared store. */
const localAlerted = new Map<string, number>();

function currentBucket(now = Date.now()): number {
  return Math.floor(now / BUCKET_MS);
}

function localKey(bucket: number, category: ErrorCategory, severity: ErrorSeverity) {
  return `${bucket}:${category}:${severity}`;
}

async function recordCount(event: TrackedErrorEvent): Promise<void> {
  const bucket = currentBucket();
  const field = `${bucket}:${event.category}:${event.severity}`;

  localCounts.set(localKey(bucket, event.category, event.severity), 1 + (localCounts.get(localKey(bucket, event.category, event.severity)) ?? 0));

  const client = getSharedRedisClient();
  if (!client) return;

  try {
    await client.hincrby(COUNTER_HASH, field, 1);
    await client.expire(COUNTER_HASH, COUNTER_TTL_SECONDS);
  } catch (error) {
    // Counting is best-effort; the alert below is not.
    logger.warn("Could not record an error count", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface ErrorCountStatus {
  recent: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export async function readErrorCounts(now = Date.now()): Promise<ErrorCountStatus> {
  const oldest = currentBucket(now) - (WINDOW_BUCKETS - 1);
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let recent = 0;

  const tally = (field: string, raw: unknown) => {
    const [bucket, category, severity] = field.split(":");
    if (Number(bucket) < oldest) return;

    const count = Number(raw) || 0;
    recent += count;
    if (category) byCategory[category] = (byCategory[category] ?? 0) + count;
    if (severity) bySeverity[severity] = (bySeverity[severity] ?? 0) + count;
  };

  const client = getSharedRedisClient();
  if (client) {
    try {
      const stored = await client.hgetall<Record<string, unknown>>(COUNTER_HASH);
      for (const [field, raw] of Object.entries(stored ?? {})) tally(field, raw);
      return { recent, byCategory, bySeverity };
    } catch (error) {
      logger.warn("Could not read error counts from the shared store", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const [field, count] of localCounts) tally(field, count);
  return { recent, byCategory, bySeverity };
}

/** Test hook. */
export function resetErrorTrackingForTests(): void {
  localCounts.clear();
  localAlerted.clear();
  sendAlert = async () => {};
}

// --- capture ---------------------------------------------------------------

async function claimAlertSlot(fingerprint: string): Promise<boolean> {
  const client = getSharedRedisClient();

  if (!client) {
    // No shared store: dedupe per instance. Weaker across instances, but a
    // deployment without a store must not page once per occurrence either.
    const now = Date.now();
    const until = localAlerted.get(fingerprint);

    if (until && until > now) return false;

    localAlerted.set(fingerprint, now + ALERT_COOLDOWN_SECONDS * 1000);
    return true;
  }

  try {
    const result = await client.set(`shipin:errors:alerted:${fingerprint}`, "1", {
      nx: true,
      ex: ALERT_COOLDOWN_SECONDS,
    });
    return result !== null && result !== undefined;
  } catch {
    // Without the store, an alert is better duplicated than dropped.
    return true;
  }
}

/**
 * Track one failure: log it structured, count it, and page once per window.
 *
 * Never throws. It is called from error paths — an MFA store outage, a failed
 * settlement, a cron job that could not run — and a reporter that throws would
 * convert each of those into an unhandled rejection.
 */
export async function captureServerError(
  error: unknown,
  options: CaptureErrorOptions
): Promise<void> {
  try {
    const event = buildErrorEvent(error, options);

    logger.error(`[${event.category}] ${event.message}`, {
      code: event.code,
      severity: event.severity,
      fingerprint: event.fingerprint,
      ...event.context,
    });

    await recordCount(event);

    const webhook = resolveErrorAlertWebhook();
    if (!webhook) return;

    if (!(await claimAlertSlot(event.fingerprint))) return;

    void sendAlert(buildErrorAlertPayload(event), webhook).catch((sendError) => {
      logger.warn("Could not deliver an error alert", {
        error: sendError instanceof Error ? sendError.message : String(sendError),
      });
    });
  } catch (captureError) {
    // Reporting must never be the thing that breaks a request.
    logger.warn("Error tracking itself failed", {
      error: captureError instanceof Error ? captureError.message : String(captureError),
    });
  }
}
