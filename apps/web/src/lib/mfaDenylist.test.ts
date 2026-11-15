import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The revocation list is the only thing that can invalidate an already-issued
 * session, so its failure modes matter more than its happy path: an unknown
 * answer must never read as "not revoked" in production.
 */

const h = vi.hoisted(() => ({
  set: vi.fn(),
  exists: vi.fn(),
  env: { url: "https://redis.example.upstash.io", token: "token" },
  isProduction: false,
}));

vi.mock("@upstash/redis", () => ({
  // A class so the module can `new Redis(...)`; instances share the spies.
  Redis: class {
    set = h.set;
    exists = h.exists;
  },
}));

vi.mock("@/config/env", () => ({
  get serverEnv() {
    return {
      UPSTASH_REDIS_REST_URL: h.env.url,
      UPSTASH_REDIS_REST_TOKEN: h.env.token,
    };
  },
  get isProduction() {
    return h.isProduction;
  },
}));

/**
 * The module caches its Redis client, so each test reloads it after adjusting
 * the environment.
 */
async function load() {
  vi.resetModules();
  return import("./mfaDenylist");
}

beforeEach(() => {
  h.set.mockReset().mockResolvedValue("OK");
  h.exists.mockReset().mockResolvedValue(1);
  h.env = { url: "https://redis.example.upstash.io", token: "token" };
  h.isProduction = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("denyMfaSession", () => {
  it("stores the session id for the rest of its lifetime", async () => {
    const { denyMfaSession, mfaDenylistKey } = await load();
    const now = 2_000_000_000_000;

    await denyMfaSession("jti-1", Math.floor(now / 1000) + 900, now);

    expect(h.set).toHaveBeenCalledWith(mfaDenylistKey("jti-1"), "1", { ex: 900 });
  });

  it("skips a session that has already expired", async () => {
    const { denyMfaSession } = await load();
    const now = 2_000_000_000_000;

    // Nothing can verify it any more, and Redis rejects a negative TTL.
    await denyMfaSession("jti-1", Math.floor(now / 1000) - 1, now);

    expect(h.set).not.toHaveBeenCalled();
  });

  it("does not throw when the store rejects the write", async () => {
    h.set.mockRejectedValue(new Error("redis down"));
    const { denyMfaSession } = await load();

    // Sign-out is in progress; a failed revocation must not block it.
    await expect(denyMfaSession("jti-1", Date.now() / 1000 + 600)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("isMfaSessionDenied", () => {
  it("reports a revoked session", async () => {
    const { isMfaSessionDenied, mfaDenylistKey } = await load();

    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);
    expect(h.exists).toHaveBeenCalledWith(mfaDenylistKey("jti-1"));
  });

  it("reports a live session", async () => {
    h.exists.mockResolvedValue(0);
    const { isMfaSessionDenied } = await load();

    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(false);
  });

  it("fails closed when the store is unreachable", async () => {
    h.exists.mockRejectedValue(new Error("redis down"));
    const { isMfaSessionDenied } = await load();

    // Unknown revocation status must not grant admin access.
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);
    expect(console.error).toHaveBeenCalled();
  });

  it("fails closed in production when no store is configured", async () => {
    h.env = { url: "", token: "" };
    h.isProduction = true;
    const { isMfaSessionDenied } = await load();

    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(true);
    expect(console.error).toHaveBeenCalled();
  });

  it("allows sessions in development without a store", async () => {
    h.env = { url: "", token: "" };
    const { isMfaSessionDenied } = await load();

    // Local development has no Redis; revocation simply is not available.
    await expect(isMfaSessionDenied("jti-1")).resolves.toBe(false);
    expect(h.exists).not.toHaveBeenCalled();
  });
});
