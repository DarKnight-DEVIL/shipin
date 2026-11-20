import { describe, expect, it } from "vitest";

import { SITE_CONFIG, SITE_URL_FALLBACK, resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("falls back when nothing is configured", () => {
    expect(resolveSiteUrl(undefined)).toBe(SITE_URL_FALLBACK);
    expect(resolveSiteUrl("")).toBe(SITE_URL_FALLBACK);
    expect(resolveSiteUrl("   ")).toBe(SITE_URL_FALLBACK);
  });

  it("reduces a configured URL to its origin so callers can append paths", () => {
    expect(resolveSiteUrl("https://example.com/some/path/")).toBe(
      "https://example.com"
    );
    expect(resolveSiteUrl("https://example.com:8443/")).toBe(
      "https://example.com:8443"
    );
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(resolveSiteUrl("  https://example.com  ")).toBe(
      "https://example.com"
    );
  });

  it("falls back instead of throwing on an unparseable value", () => {
    expect(resolveSiteUrl("example.com")).toBe(SITE_URL_FALLBACK);
    expect(resolveSiteUrl("not a url")).toBe(SITE_URL_FALLBACK);
  });
});

describe("SITE_URL_FALLBACK", () => {
  it("is not the retired canonical domain that answers 410", () => {
    expect(SITE_URL_FALLBACK).not.toBe("https://shipin.co");
    expect(() => new URL(SITE_URL_FALLBACK)).not.toThrow();
    expect(new URL(SITE_URL_FALLBACK).pathname).toBe("/");
  });

  it("is what SITE_CONFIG falls back to when no app URL is configured", () => {
    expect(SITE_CONFIG.url).toBe(
      resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL)
    );
  });
});
