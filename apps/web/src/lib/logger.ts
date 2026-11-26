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
function serialize(entry: LogEntry): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
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
