// @vitest-environment node

/**
 * The logger's contract with whatever consumes its output.
 *
 * The point of changing this at all: a log drain needs fields, not a sentence. So
 * every assertion here parses the emitted line as JSON. If someone reintroduces a text
 * prefix, `JSON.parse` throws and these fail - which is the intended tripwire, because
 * the old format looked fine in a terminal and was unusable downstream.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger, childLogger } from "./logger";
import { runWithRequestContext } from "./requestContext";

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
      // Circular references are handled now (see "redaction"), so this needs a
      // value JSON cannot express at all. The fallback must stay reachable: a
      // logger that throws on one bad field loses every line after it.
      logger.error("BigInt", { total: BigInt(1) });

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

describe("redaction", () => {
  it("scrubs an email that reaches context as a value", () => {
    logger.error("Mailer failed", {
      requestId: "req-123",
      error: "Resend rejected recipient parent@example.com",
    });

    expect(recordOf(consoleErrorSpy).context).toEqual({
      requestId: "req-123",
      error: "Resend rejected recipient [email]",
    });
  });

  it("scrubs an email in a nested object and in an array", () => {
    logger.info("Consent sent", {
      parent: { deliverTo: "guardian@example.org" },
      recipients: ["a@example.com", "b@example.net"],
    });

    expect(recordOf(consoleLogSpy).context).toEqual({
      parent: { deliverTo: "[email]" },
      recipients: ["[email]", "[email]"],
    });
  });

  it("redacts sensitive keys whole, whatever they hold", () => {
    logger.warn("Address saved", {
      shippingAddress: { line1: "1 Main St", city: "Pune" },
      password: "hunter2",
      sessionToken: "abc",
      firstName: "Asha",
    });

    expect(recordOf(consoleWarnSpy).context).toEqual({
      shippingAddress: "[redacted]",
      password: "[redacted]",
      sessionToken: "[redacted]",
      firstName: "[redacted]",
    });
  });

  it("scrubs the message itself, not just the context", () => {
    logger.error("Could not send to parent@example.com");

    expect(recordOf(consoleErrorSpy).message).toBe("Could not send to [email]");
  });

  it("keeps non-PII scalars, ids and boolean flags intact", () => {
    logger.info("Captured", {
      requestId: "REQ-20261128-1234567",
      amount: 429900,
      emailSent: true,
      uid: "abc123uid",
    });

    expect(recordOf(consoleLogSpy).context).toEqual({
      requestId: "REQ-20261128-1234567",
      amount: 429900,
      emailSent: true,
      uid: "abc123uid",
    });
  });

  it("still emits one valid line for a circular context", () => {
    const circular: Record<string, unknown> = { requestId: "req-1" };
    circular.self = circular;

    logger.info("loop", circular);

    expect(recordOf(consoleLogSpy).context).toEqual({
      requestId: "req-1",
      self: "[circular]",
    });
  });
});

describe("LOG_LEVEL", () => {
  it("suppresses levels below the configured floor", () => {
    vi.stubEnv("LOG_LEVEL", "warn");

    logger.info("suppressed");
    logger.debug("suppressed too");
    logger.warn("written");

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it("can raise the floor above warnings", () => {
    vi.stubEnv("LOG_LEVEL", "error");

    logger.warn("suppressed");

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("lets an operator enable debug output in production", () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    vi.stubEnv("NODE_ENV", "production");

    logger.debug("written");

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps debug suppressed in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");

    logger.debug("suppressed");

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it("ignores an unrecognised value rather than silencing everything", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");

    logger.info("written");

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });
});

describe("request correlation", () => {
  it("fills the request id from the ambient scope", () => {
    runWithRequestContext({ requestId: "req-abc" }, () => {
      logger.error("Failed", { status: 500 });
    });

    expect(recordOf(consoleErrorSpy).context).toEqual({
      requestId: "req-abc",
      status: 500,
    });
  });

  it("reaches a logger many frames below the scope", async () => {
    await runWithRequestContext({ requestId: "req-deep" }, async () => {
      await Promise.resolve();
      logger.info("deep");
    });

    expect(recordOf(consoleLogSpy).context).toEqual({ requestId: "req-deep" });
  });

  it("lets an explicit requestId win over the ambient one", () => {
    runWithRequestContext({ requestId: "req-ambient" }, () => {
      logger.info("explicit", { requestId: "req-explicit" });
    });

    expect(recordOf(consoleLogSpy).context).toEqual({
      requestId: "req-explicit",
    });
  });

  it("adds nothing outside a scope", () => {
    logger.info("no scope");

    expect(recordOf(consoleLogSpy).context ?? {}).toEqual({});
  });
});
