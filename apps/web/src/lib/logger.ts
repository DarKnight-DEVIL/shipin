/**
 * Structured logger for ShipIN.
 *
 * Every entry is ONE line of JSON on stdout (or stderr, for warn/error), which is
 * what a log shipper needs: a field to filter on and no multi-line record to stitch
 * back together.
 *
 * This used to emit a text prefix (`[timestamp] [LEVEL] message`) with the context
 * appended as JSON, while this comment claimed the output was JSON. Anything
 * shipping those logs would have had to parse a custom format with a regex, and
 * every message containing a bracket would have broken it.
 *
 * The context stays nested rather than flattened into the top level, so a caller's
 * field can never overwrite `level`, `message` or `timestamp`. A log drain indexes
 * `context.service` as its service label, which is why it is a field and not part of
 * the message text.
 *
 * Usage:
 *   logger.info("Payment captured", { requestId, amount });
 *   logger.error("PayPal API failed", { requestId, status });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

/** JSON that cannot fail: a circular context still produces one valid line. */

/**
 * Keys whose values are never written, whatever they hold.
 *
 * Redaction lives here rather than at each call site because the leak is the
 * call site nobody thought about: a mailer error whose message echoes the
 * recipient's address, a `shippingAddress` object passed for debugging. A
 * logger that only promises "callers will be careful" is not a control.
 *
 * `uid` is deliberately absent: Firebase uids are opaque ids needed to trace a
 * request, and redacting them would make the logs unable to answer "which
 * account failed?".
 */
const SENSITIVE_KEY =
  /(secret|token|password|passwd|authorization|cookie|apikey|api_key|private|credential|card|cvv|email|phone|address|firstname|lastname|fullname|passport|iban|ssn|dob|birthdate)/i;

/**
 * Emails are scrubbed by value as well as by key: the common leak is not a field
 * called `email` but an error string or template that happens to contain one.
 * Phone numbers are only caught by key on purpose - the numeric pattern that
 * matches a phone number also matches an id or an amount, and mangling those
 * would cost the debuggability this logger exists for.
 */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

const MAX_REDACT_DEPTH = 6;

function scrubText(value: string): string {
  return value.replace(EMAIL_PATTERN, "[email]");
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubText(value);

  // Booleans and numbers cannot be PII, and redacting them would turn
  // `emailSent: true` into noise.
  if (value === null || typeof value !== "object") return value;

  if (depth >= MAX_REDACT_DEPTH) return "[depth]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const pii =
      SENSITIVE_KEY.test(key) &&
      item !== null &&
      typeof item !== "boolean" &&
      typeof item !== "number";

    out[key] = pii ? "[redacted]" : redactValue(item, depth + 1, seen);
  }

  return out;
}

function serialize(entry: LogEntry): string {
  const safe: LogEntry = {
    ...entry,
    message: scrubText(entry.message),
    ...(entry.context
      ? { context: redactValue(entry.context, 0, new WeakSet()) as Record<string, unknown> }
      : {}),
  };

  try {
    return JSON.stringify(safe);
  } catch {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      message: scrubText(entry.message),
      context: { serializeError: "context was not serialisable" },
    });
  }
}

function emit(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  const hasContext = context !== undefined && Object.keys(context).length > 0;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(hasContext ? { context } : {}),
  };

  const line = serialize(entry);

  // error and warn go to stderr where container runtimes and log shippers collect
  // them; info and debug stay on stdout so severity filters can tell them apart.
  // This file switches the no-console rule off.
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  if (level === "debug") {
    // Debug is suppressed in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(line);
    }
    return;
  }
  console.log(line);
}

export const logger = {
  /** Debug-level log (suppressed in production). */
  debug(message: string, context?: Record<string, unknown>): void {
    emit("debug", message, context);
  },

  /** Info-level log. */
  info(message: string, context?: Record<string, unknown>): void {
    emit("info", message, context);
  },

  /** Warning-level log. */
  warn(message: string, context?: Record<string, unknown>): void {
    emit("warn", message, context);
  },

  /** Error-level log. */
  error(message: string, context?: Record<string, unknown>): void {
    emit("error", message, context);
  },
};

/**
 * Create a child logger with a fixed context prefix.
 *
 * The prefix is merged into every entry's context, so `service` survives as
 * `context.service` in the shipped record and can become a queryable label.
 *
 * @example
 * const paypalLogger = childLogger({ service: "paypal" });
 * paypalLogger.error("API call failed", { status: 500 });
 */
export function childLogger(baseContext: Record<string, unknown>) {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      emit("debug", message, { ...baseContext, ...context }),
    info: (message: string, context?: Record<string, unknown>) =>
      emit("info", message, { ...baseContext, ...context }),
    warn: (message: string, context?: Record<string, unknown>) =>
      emit("warn", message, { ...baseContext, ...context }),
    error: (message: string, context?: Record<string, unknown>) =>
      emit("error", message, { ...baseContext, ...context }),
  };
}
