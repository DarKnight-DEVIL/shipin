import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// isolate: false shares a module registry between files; without this a
// cached real module would bypass the mocks below.
vi.hoisted(() => {
  vi.resetModules();
});

const state = vi.hoisted(() => ({
  client: null as null | object,
  limit: vi.fn(),
  instances: [] as Array<{ prefix: string; limiter: unknown }>,
}));

vi.mock("@/lib/redisRateLimiter", () => ({
  getSharedRedisClient: () => state.client,
  // `resetOutboundRateLimit()` clears the store through the module it
  // imported, so the replacement has to offer the same hook.
  resetSharedRedisClientForTests: () => {},
}));

/*
 * The Upstash client is replaced, not driven: what this file owns is the
 * wiring (one instance per channel, the recipient as the identifier, the
 * token-bucket algorithm, fail-open on a store error) — the algorithm itself
 * is Upstash's, covered there.
 */
vi.mock("@upstash/ratelimit", () => {
  class FakeRatelimit {
    prefix: string;
    limiter: unknown;
    constructor(config: {
      redis: unknown;
      limiter: unknown;
      prefix: string;
    }) {
      this.prefix = config.prefix;
      this.limiter = config.limiter;
      state.instances.push(this);
    }
    limit = async (identifier: string) => state.limit(identifier);
    static tokenBucket = (...args: unknown[]) => ({
      algorithm: "tokenBucket",
      args,
    });
  }
  return { Ratelimit: FakeRatelimit };
});

import {
  allowOutboundEmail,
  allowOutboundWhatsApp,
  normalizeEmailRecipient,
  normalizePhoneRecipient,
  OUTBOUND_MAX_TOKENS,
  OUTBOUND_REFILL_INTERVAL_MS,
  resetOutboundRateLimit,
} from "./outboundRateLimit";

beforeEach(() => {
  state.client = null;
  state.limit.mockReset();
  state.instances.length = 0;
  resetOutboundRateLimit();
});

// `isolate: false` can leave this file's mocked modules cached for the next
// file in the worker, and a fake client whose limit() says nothing would
// break every send there. Hand the next file an unconfigured store.
afterEach(() => {
  state.client = null;
});

describe("allowOutboundEmail — in-process fallback", () => {
  it("allows the burst and refuses the send that exhausts the bucket", async () => {
    const start = Date.now();

    for (let index = 0; index < OUTBOUND_MAX_TOKENS; index += 1) {
      await expect(allowOutboundEmail("a@example.com", start)).resolves.toBe(
        true
      );
    }

    await expect(allowOutboundEmail("a@example.com", start)).resolves.toBe(
      false
    );
  });

  it("does not spend a token on a refused send", async () => {
    const start = Date.now();

    for (let index = 0; index < OUTBOUND_MAX_TOKENS; index += 1) {
      await allowOutboundEmail("a@example.com", start);
    }
    await expect(allowOutboundEmail("a@example.com", start)).resolves.toBe(
      false
    );

    // One refill interval later exactly one token has dripped back.
    await expect(
      allowOutboundEmail("a@example.com", start + OUTBOUND_REFILL_INTERVAL_MS)
    ).resolves.toBe(true);
    await expect(
      allowOutboundEmail("a@example.com", start + OUTBOUND_REFILL_INTERVAL_MS)
    ).resolves.toBe(false);
  });

  it("keeps one bucket per address, not one per call", async () => {
    const start = Date.now();

    for (let index = 0; index < OUTBOUND_MAX_TOKENS; index += 1) {
      await allowOutboundEmail("a@example.com", start);
    }

    // A different address starts from a full bucket.
    await expect(allowOutboundEmail("b@example.com", start)).resolves.toBe(
      true
    );
  });

  it("shares the bucket across formatting of the same address", async () => {
    const start = Date.now();

    for (let index = 0; index < OUTBOUND_MAX_TOKENS; index += 1) {
      await allowOutboundEmail("User@Example.com", start);
    }

    await expect(
      allowOutboundEmail("  user@example.com ", start)
    ).resolves.toBe(false);
  });

  it("keeps email and WhatsApp buckets separate", async () => {
    const start = Date.now();

    for (let index = 0; index < OUTBOUND_MAX_TOKENS; index += 1) {
      await allowOutboundEmail("user@example.com", start);
    }

    // The same string as a phone key is a different channel, a different
    // bucket — normalization is per channel, not global.
    await expect(allowOutboundWhatsApp("user@example.com", start)).resolves.toBe(
      true
    );
  });

  it("lets an empty address through: there is nothing to bound", async () => {
    await expect(allowOutboundEmail("   ")).resolves.toBe(true);
    await expect(allowOutboundWhatsApp("+++")).resolves.toBe(true);
  });
});

describe("allowOutboundWhatsApp — in-process fallback", () => {
  it("allows the burst and refuses the send that exhausts the bucket", async () => {
    const start = Date.now();

    for (let index = 0; index < OUTBOUND_MAX_TOKENS; index += 1) {
      await expect(allowOutboundWhatsApp("+91 98765 43210", start)).resolves.toBe(
        true
      );
    }

    // The same number, formatted the way the Graph API call writes it.
    await expect(allowOutboundWhatsApp("919876543210", start)).resolves.toBe(
      false
    );
  });
});

describe("shared Redis store", () => {
  it("limits by recipient through one Ratelimit per channel", async () => {
    state.client = {};
    state.limit.mockResolvedValue({ success: true });

    await allowOutboundEmail("user@example.com");
    await allowOutboundWhatsApp("919876543210");

    expect(state.instances).toHaveLength(2);
    expect(state.instances.map((instance) => instance.prefix)).toEqual([
      "shipin:outbound:email",
      "shipin:outbound:whatsapp",
    ]);
    // The identifier is the normalized recipient, not the raw input.
    expect(state.limit).toHaveBeenNthCalledWith(1, "user@example.com");
    expect(state.limit).toHaveBeenNthCalledWith(2, "919876543210");
    // The algorithm is the token bucket the module promises.
    expect(state.instances[0].limiter).toMatchObject({
      algorithm: "tokenBucket",
    });
  });

  it("propagates the store's refusal", async () => {
    state.client = {};
    state.limit.mockResolvedValue({ success: false });

    await expect(allowOutboundEmail("user@example.com")).resolves.toBe(false);
  });

  it("fails open when the store errors, so an outage is not an outbound outage", async () => {
    state.client = {};
    state.limit.mockRejectedValue(new Error("redis down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(allowOutboundEmail("user@example.com")).resolves.toBe(true);
  });
});

describe("normalization", () => {
  it("lowercases and trims email addresses", () => {
    expect(normalizeEmailRecipient("  User@Example.COM ")).toBe(
      "user@example.com"
    );
  });

  it("reduces phone numbers to digits", () => {
    expect(normalizePhoneRecipient("+91 98765 43210")).toBe("919876543210");
  });
});
