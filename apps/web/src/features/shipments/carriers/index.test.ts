import { describe, it, expect, vi, beforeEach } from "vitest";

const env = vi.hoisted(() => ({
  serverEnv: {
    INDIA_POST_TRACKING_URL: "",
    INDIA_POST_CLIENT_ID: "",
    INDIA_POST_CLIENT_SECRET: "",
  },
  flags: { isProduction: false },
}));

vi.mock("@/config/env", () => ({
  serverEnv: env.serverEnv,
  // A getter, so a test can flip the deployment mode after the module loaded.
  get isProduction() {
    return env.flags.isProduction;
  },
}));

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which `@/config/env` this module binds to, so a static
// import inherits another suite's real (or differently mocked) env and the
// configuration cases below read empty values.
let getTrackingProvider: typeof import("./index").getTrackingProvider;
let isIndiaPostConfigured: typeof import("./index").isIndiaPostConfigured;
let getIndiaPostStatus: typeof import("./index").getIndiaPostStatus;
let reportIndiaPostStatus: typeof import("./index").reportIndiaPostStatus;

/** Every credential India Post needs, applied to the stubbed server env. */
function configure() {
  env.serverEnv.INDIA_POST_TRACKING_URL = "https://cept.example.test/track";
  env.serverEnv.INDIA_POST_CLIENT_ID = "client";
  env.serverEnv.INDIA_POST_CLIENT_SECRET = "secret";
}

beforeEach(async () => {
  env.serverEnv.INDIA_POST_TRACKING_URL = "";
  env.serverEnv.INDIA_POST_CLIENT_ID = "";
  env.serverEnv.INDIA_POST_CLIENT_SECRET = "";
  env.flags.isProduction = false;

  vi.resetModules();
  ({
    getTrackingProvider,
    isIndiaPostConfigured,
    getIndiaPostStatus,
    reportIndiaPostStatus,
  } = await import("./index"));
});

describe("placeholder fallback", () => {
  it("warns once that tracking is serving placeholder data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const fresh = await import("./index");

    fresh.getTrackingProvider();
    fresh.getTrackingProvider();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("placeholder feed");
    warn.mockRestore();
  });
});

describe("getTrackingProvider", () => {
  it("falls back to placeholder when nothing is configured", () => {
    const provider = getTrackingProvider();

    expect(provider.id).toBe("placeholder");
    expect(provider.placeholder).toBe(true);
    expect(isIndiaPostConfigured()).toBe(false);
  });

  it("stays on placeholder with a partial configuration", () => {
    env.serverEnv.INDIA_POST_TRACKING_URL = "https://cept.example.test/track";

    expect(getTrackingProvider().id).toBe("placeholder");
    expect(isIndiaPostConfigured()).toBe(false);
  });

  it("uses India Post when all three values are present", () => {
    configure();

    const provider = getTrackingProvider();

    expect(provider.id).toBe("indiapost");
    expect(provider.placeholder).toBe(false);
    expect(isIndiaPostConfigured()).toBe(true);
  });
});

describe("getIndiaPostStatus", () => {
  it("reports production without credentials as degraded", () => {
    env.flags.isProduction = true;

    expect(getIndiaPostStatus()).toEqual({ configured: false, degraded: true });
  });

  it("is not degraded once every credential is present", () => {
    env.flags.isProduction = true;
    configure();

    expect(getIndiaPostStatus()).toEqual({ configured: true, degraded: false });
  });

  it("is never degraded outside production", () => {
    expect(getIndiaPostStatus()).toEqual({
      configured: false,
      degraded: false,
    });
  });
});

describe("reportIndiaPostStatus", () => {
  it("warns at startup only when tracking is degraded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    env.flags.isProduction = true;

    expect(reportIndiaPostStatus()).toEqual({
      configured: false,
      degraded: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("INDIA_POST_TRACKING_URL");

    // Configured in production: nothing to warn about.
    env.flags.isProduction = false;
    warn.mockClear();

    expect(reportIndiaPostStatus()).toEqual({
      configured: false,
      degraded: false,
    });
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
