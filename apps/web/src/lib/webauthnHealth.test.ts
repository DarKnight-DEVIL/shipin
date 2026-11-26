import { describe, expect, it } from "vitest";

import { normalizeHost, webauthnHealth } from "./webauthnHealth";

const APP = "https://shipin.app";

describe("normalizeHost", () => {
  it("lowercases, drops the port and the root dot", () => {
    expect(normalizeHost("ShipIN.App:443.")).toBe("shipin.app");
    expect(normalizeHost("  shipin.app  ")).toBe("shipin.app");
    expect(normalizeHost("localhost:3001")).toBe("localhost");
  });

  it("keeps IPv6 brackets intact", () => {
    // Stripping the port must not eat the closing bracket: `[::1]` and `[::1]:3000`
    // are the same host, and `[::1` is not a host at all.
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
    expect(normalizeHost("[::1]")).toBe("[::1]");
  });

  it("reports nothing for a missing or empty header", () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost("   ")).toBeNull();
    expect(normalizeHost(".")).toBeNull();
  });
});

describe("webauthnHealth", () => {
  it("matches when the request arrived on APP_URL's host", () => {
    const health = webauthnHealth("shipin.app", {
      appUrl: APP,
      production: true,
    });

    expect(health).toEqual({
      origin: "https://shipin.app",
      rpID: "shipin.app",
      servedHost: "shipin.app",
      matches: true,
      error: null,
      degraded: false,
    });
  });

  it("degrades in production when served on another hostname", () => {
    const health = webauthnHealth("shipin-git-main.vercel.app", {
      appUrl: APP,
      production: true,
    });

    expect(health.matches).toBe(false);
    expect(health.degraded).toBe(true);
  });

  it("does not degrade outside production", () => {
    // `next dev` serves localhost while APP_URL names the deployment: normal, not a fault.
    const health = webauthnHealth("localhost:3000", {
      appUrl: APP,
      production: false,
    });

    expect(health.matches).toBe(false);
    expect(health.degraded).toBe(false);
  });

  it("strips a path from APP_URL before comparing", () => {
    const health = webauthnHealth("shipin.app", {
      appUrl: "https://shipin.app/some/path",
      production: true,
    });

    expect(health.origin).toBe("https://shipin.app");
    expect(health.matches).toBe(true);
  });

  it("reports no judgement without both sides", () => {
    // A proxy that drops Host, or a deployment with no APP_URL, must not be called a
    // mismatch: `matches: null` says "unknown", which is what it is.
    expect(
      webauthnHealth(null, { appUrl: APP, production: true }).matches
    ).toBeNull();
    expect(
      webauthnHealth("shipin.app", { appUrl: APP, production: true }).matches
    ).toBe(true);
  });

  it("degrades in production when APP_URL cannot produce an origin", () => {
    const health = webauthnHealth("shipin.app", {
      // Empty, not undefined: undefined means "read the configured env".
      appUrl: "",
      production: true,
    });

    expect(health.origin).toBeNull();
    expect(health.rpID).toBeNull();
    expect(health.error).toMatch(/APP_URL must be an absolute URL/);
    expect(health.degraded).toBe(true);
  });
});
