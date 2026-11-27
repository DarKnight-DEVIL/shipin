import { describe, expect, it } from "vitest";

import { parseTrackingLookup } from "./trackingInput";

describe("parseTrackingLookup", () => {
  it("accepts a bare tracking id", () => {
    expect(parseTrackingLookup(" SHP-7Q2M4X8B1N6R3T5V ")).toEqual({
      trackingId: "SHP-7Q2M4X8B1N6R3T5V",
    });
  });

  it("returns null for an empty value", () => {
    expect(parseTrackingLookup("   ")).toBeNull();
  });

  it("reads the token from an id with a query string", () => {
    expect(parseTrackingLookup("SHP-2026-000001?token=abc123")).toEqual({
      trackingId: "SHP-2026-000001",
      token: "abc123",
    });
  });

  it("accepts a pasted tracking link", () => {
    expect(
      parseTrackingLookup(
        "https://shipin.app/track/SHP-2026-000001?token=abc123"
      )
    ).toEqual({ trackingId: "SHP-2026-000001", token: "abc123" });
  });

  it("accepts a relative tracking link", () => {
    expect(
      parseTrackingLookup("/track/SHP-2026-000001?token=abc123")
    ).toEqual({ trackingId: "SHP-2026-000001", token: "abc123" });
  });

  it("decodes an encoded id in a link", () => {
    expect(
      parseTrackingLookup("https://shipin.app/track/SHP-2026-000001")
    ).toEqual({ trackingId: "SHP-2026-000001" });
  });

  it("returns null for a malformed absolute url", () => {
    expect(parseTrackingLookup("https://")).toBeNull();
  });
});
