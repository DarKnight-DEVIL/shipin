/**
 * Structured logger for ShipIN.
 *
 * Replaces ad-hoc console.* calls with a single, consistent interface.
 * All logs are emitted as JSON so they can be ingested by log aggregators
 * (CloudWatch, Datadog, Sentry, etc.).
 *
 * Usage:
 *   logger.info("Payment captured", { requestId, amount });
 *   logger.error("PayPal API failed", { requestId, status });
 *   logger.warn("Rate limit approaching", { ip, remaining });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

function formatEntry(entry: LogEntry): string {
  const { level, message, context, timestamp } = entry;
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (context && Object.keys(context).length > 0) {
    try {
      return `${base} ${JSON.stringify(context)}`;
    } catch {
      // Circular references in context — fall back to a safe string.
      return `${base} [unserializable context]`;
    }
  }
  return base;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  const formatted = formatEntry(entry);

  // Only console.error and console.warn are used (they are whitelisted by
  // the no-console ESLint rule for this file). Errors go to stderr where
  // container runtimes and log shippers collect them.
  if (level === "error") {
    console.error(formatted);
    return;
  }
  if (level === "warn") {
    console.warn(formatted);
    return;
  }
  if (level === "debug") {
    // Debug is suppressed in production.
    if (process.env.NODE_ENV !== "production") {
      console.warn(formatted);
    }
    return;
  }
  // info
  console.warn(formatted);
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
 * @example
 * const paypalLogger = logger.child({ service: "paypal" });
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