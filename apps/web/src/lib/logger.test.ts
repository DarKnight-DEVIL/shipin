// @vitest-environment node

/**
 * The logger's contract with whatever consumes its output.
 *
 * The point of changing this at all: a shipper (Vector, in docker/vector) needs
 * fields, not a sentence. So every assertion here parses the emitted line as JSON.
 * If someone reintroduces a text prefix, `JSON.parse` throws and these fail - which
 * is the intended tripwire, because the old format looked fine in a terminal and was
 * unusable downstream.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger, childLogger } from "./logger";

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  vi.unstubAllEnvs();
});

/** The single line the logger wrote to the given spy, parsed. */
function recordOf(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  expect(spy.mock.calls).toHaveLength(1);

  return JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
}

describe("logger", () => {
  describe("error", () => {
    it("writes one JSON line with the message and context", () => {
      logger.error("Payment failed", { requestId: "req-123", amount: 100 });

      expect(recordOf(consoleErrorSpy)).toEqual({
        timestamp: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
        level: "error",
        message: "Payment failed",
        context: { requestId: "req-123", amount: 100 },
      });
    });

    it("survives a context that cannot be serialised", () => {
      const circular: { a: number; self?: unknown } = { a: 1 };
      circular.self = circular;

      logger.error("Circular", circular);

      // Still one parsable line, and it says what happened instead of throwing.
      expect(recordOf(consoleErrorSpy).context).toEqual({
        serializeError: "context was not serialisable",
      });
    });
  });

  describe("severity", () => {
    it("sends warn to stderr", () => {
      logger.warn("Almost out of quota");

      expect(recordOf(consoleWarnSpy).level).toBe("warn");
      // An absent context is not emitted as {}: an empty object invites queries for
      // a field that will never have a value.
      expect(recordOf(consoleWarnSpy)).not.toHaveProperty("context");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("sends info to stdout", () => {
      logger.info("Started", { port: 3000 });

      expect(recordOf(consoleLogSpy)).toMatchObject({
        level: "info",
        message: "Started",
        context: { port: 3000 },
      });
    });

    it("suppresses debug in production and emits it elsewhere", () => {
      vi.stubEnv("NODE_ENV", "production");
      logger.debug("never in production");
      expect(consoleLogSpy).not.toHaveBeenCalled();

      vi.stubEnv("NODE_ENV", "development");
      logger.debug("visible in development");
      expect(recordOf(consoleLogSpy).level).toBe("debug");
    });
  });

  describe("a message that would have broken a text format", () => {
    it("keeps brackets, quotes and newlines inside the JSON string", () => {
      const message = '[ERROR] not really an error\n"quoted"';

      logger.info(message);

      // The old line format turned this into a record the shipper would have parsed
      // as an error with a truncated message.
      expect(recordOf(consoleLogSpy)).toMatchObject({
        level: "info",
        message,
      });
    });
  });
});

describe("childLogger", () => {
  it("carries its service name into every entry's context", () => {
    const paypal = childLogger({ service: "paypal" });

    paypal.error("API call failed", { status: 500 });

    // `context.service` is what the shipper promotes to a label, so it has to
    // survive the merge with the call's own context.
    expect(recordOf(consoleErrorSpy).context).toEqual({
      service: "paypal",
      status: 500,
    });
  });

  it("lets the call override a reserved-looking key without losing the service", () => {
    const log = childLogger({ service: "checkout", attempt: 1 });

    log.info("retrying", { attempt: 2 });

    expect(recordOf(consoleLogSpy).context).toEqual({
      service: "checkout",
      attempt: 2,
    });
  });
});
