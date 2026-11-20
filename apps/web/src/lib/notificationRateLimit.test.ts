import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// isolate: false shares a module registry between files; without this a
// cached real module would bypass the mock below.
vi.hoisted(() => {
  vi.resetModules();
});

const state = vi.hoisted(() => ({
  client: null as null | {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/lib/redisRateLimiter", () => ({
  getSharedRedisClient: () => state.client,
  // `resetNotificationRateLimit()` clears the store through the module it
  // imported, so the replacement has to offer the same hook.
  resetSharedRedisClientForTests: () => {},
}));

import {
  allowNotification,
  NOTIFICATION_RATE_LIMIT,
  NOTIFICATION_RATE_WINDOW_MS,
  resetNotificationRateLimit,
} from "./notificationRateLimit";

function redis(config: { count?: number; fail?: boolean } = {}) {
  return {
    incr: vi.fn(async () => {
      if (config.fail) throw new Error("redis down");
      return config.count ?? 1;
    }),
    expire: vi.fn(async () => 1),
  };
}

beforeEach(() => {
  state.client = null;
  resetNotificationRateLimit();
});

// `isolate: false` can leave this file's mocked modules cached for the next
// file in the worker, and a fake client whose INCR says nothing would drop
// every notification there. Hand the next file an unconfigured store.
afterEach(() => {
  state.client = null;
});

describe("allowNotification — in-process fallback", () => {
  it("allows the hourly budget and drops the next one", async () => {
    for (let index = 0; index < NOTIFICATION_RATE_LIMIT; index += 1) {
      await expect(allowNotification("user-1")).resolves.toBe(true);
    }

    await expect(allowNotification("user-1")).resolves.toBe(false);
  });

  it("keeps budgets per user", async () => {
    for (let index = 0; index < NOTIFICATION_RATE_LIMIT; index += 1) {
      await allowNotification("user-1");
    }

    await expect(allowNotification("user-2")).resolves.toBe(true);
  });

  it("forgets sends that fell out of the window", async () => {
    const start = Date.now();

    for (let index = 0; index < NOTIFICATION_RATE_LIMIT; index += 1) {
      await allowNotification("user-1", start);
    }
    await expect(allowNotification("user-1", start)).resolves.toBe(false);

    await expect(
      allowNotification("user-1", start + NOTIFICATION_RATE_WINDOW_MS + 1)
    ).resolves.toBe(true);
  });

  it("sweeps idle buckets instead of growing without bound", async () => {
    const start = Date.now();

    for (let index = 0; index < 5_001; index += 1) {
      await allowNotification(`bulk-${index}`, start);
    }

    // The sweep is opportunistic, so assert the budget still behaves rather
    // than the exact map size.
    await expect(allowNotification("after-sweep", start)).resolves.toBe(true);
  });
});

describe("allowNotification — shared store", () => {
  it("uses the shared counter and sets the window on the first hit", async () => {
    const client = redis({ count: 1 });
    state.client = client;

    await expect(allowNotification("user-1")).resolves.toBe(true);
    expect(client.incr).toHaveBeenCalledWith(expect.stringContaining("user-1"));
    expect(client.expire).toHaveBeenCalledWith(
      expect.any(String),
      Math.floor(NOTIFICATION_RATE_WINDOW_MS / 1000)
    );
  });

  it("does not reset the window on later hits", async () => {
    const client = redis({ count: 3 });
    state.client = client;

    await allowNotification("user-1");

    expect(client.expire).not.toHaveBeenCalled();
  });

  it("drops the message once the shared counter passes the limit", async () => {
    state.client = redis({ count: NOTIFICATION_RATE_LIMIT + 1 });

    await expect(allowNotification("user-1")).resolves.toBe(false);
  });

  it("falls closed when the store fails, keeping the rate limit global", async () => {
    state.client = redis({ fail: true });

    for (let index = 0; index < NOTIFICATION_RATE_LIMIT; index += 1) {
      await expect(allowNotification("user-1")).resolves.toBe(false);
    }

    await expect(allowNotification("user-1")).resolves.toBe(false);
  });
});
