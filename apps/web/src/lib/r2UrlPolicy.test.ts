// @vitest-environment node

/**
 * Presigned-URL lifetimes, per purpose.
 *
 * The number is a security parameter, so the cases that matter are the ones where a
 * bad value must NOT be honoured: a typo, a negative, or something longer than SigV4
 * allows. Each falls back to the default rather than failing the request, because a
 * broken environment variable should degrade to the reviewed value, not blank the
 * gallery.
 */

import { describe, expect, it } from "vitest";

import {
  purposeForKey,
  r2UrlTtlSeconds,
  r2UrlDefaultTtlSeconds,
  r2UrlTtlEnvVar,
} from "./r2UrlPolicy";

const env = (value?: string): Record<string, string | undefined> =>
  value === undefined ? {} : { [r2UrlTtlEnvVar("inspection")]: value };

describe("purposeForKey", () => {
  it("distinguishes the two purposes by prefix", () => {
    expect(purposeForKey("inspection/req-1/box.jpg")).toBe("inspection");
    expect(purposeForKey("labels/req-1/label.pdf")).toBe("shippingLabel");
  });

  it("returns null for a prefix this app does not serve", () => {
    expect(purposeForKey("invoices/secret.pdf")).toBeNull();
    expect(purposeForKey("inspection-evil/req-1/box.jpg")).toBeNull();
  });
});

describe("r2UrlTtlSeconds", () => {
  it("defaults inspection to an hour and a label to fifteen minutes", () => {
    // The two cases genuinely differ: a review pass takes minutes, a label download
    // is immediate, so the tighter lifetime is the right default for the document.
    expect(r2UrlTtlSeconds("inspection", {})).toBe(3600);
    expect(r2UrlTtlSeconds("shippingLabel", {})).toBe(900);
  });

  it("honours a configured value", () => {
    expect(r2UrlTtlSeconds("inspection", env("7200"))).toBe(7200);
    expect(
      r2UrlTtlSeconds("shippingLabel", { R2_LABEL_URL_TTL_SECONDS: "300" })
    ).toBe(300);
  });

  it.each([
    ["below a minute", "30"],
    ["longer than SigV4 allows", String(8 * 24 * 60 * 60)],
    ["not a number", "fifteen"],
    ["empty", ""],
    ["negative", "-600"],
  ])("ignores a value that is %s", (_label, value) => {
    expect(r2UrlTtlSeconds("inspection", env(value))).toBe(
      r2UrlDefaultTtlSeconds("inspection")
    );
  });

  it("floors a fractional value rather than passing it to the signer", () => {
    expect(r2UrlTtlSeconds("inspection", env("3600.9"))).toBe(3600);
  });
});
