import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizePublicTrackingId,
  createPublicTrackingUrl,
  createTrackingToken,
  isModernTrackingId,
  verifyTrackingToken,
} from "./trackingToken";

const SECRET = "tracking-token-secret-0123456789";
const MODERN = "SHP-7Q2M4X8B1N6R3T5V";
const LEGACY = "SHP-2026-000001";

beforeEach(() => {
  vi.stubEnv("TRACKING_TOKEN_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isModernTrackingId", () => {
  it("accepts the 16-character Crockford format", () => {
    expect(isModernTrackingId(MODERN)).toBe(true);
  });

  it("rejects the legacy sequential format", () => {
    expect(isModernTrackingId(LEGACY)).toBe(false);
  });

  it("rejects a value with easy-to-misread characters", () => {
    expect(isModernTrackingId("SHP-7Q2M4X8B1N6R3T5I")).toBe(false);
  });
});

describe("tracking tokens", () => {
  it("verifies a token minted for the same id", () => {
    const token = createTrackingToken(MODERN);

    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifyTrackingToken(MODERN, token!)).toBe(true);
  });

  it("rejects a token minted for another id", () => {
    const token = createTrackingToken(LEGACY)!;

    expect(verifyTrackingToken("SHP-2026-000002", token)).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = createTrackingToken(LEGACY)!;
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    expect(verifyTrackingToken(LEGACY, tampered)).toBe(false);
  });

  it("produces no token without a usable secret", () => {
    vi.stubEnv("TRACKING_TOKEN_SECRET", "");
    vi.stubEnv("MFA_SESSION_SECRET", "");

    expect(createTrackingToken(LEGACY)).toBeNull();
    expect(verifyTrackingToken(LEGACY, "anything")).toBe(false);
  });
});

describe("authorizePublicTrackingId", () => {
  it("accepts a modern random id without a token", () => {
    expect(authorizePublicTrackingId(MODERN, null)).toBe(MODERN);
  });

  it("refuses a legacy id without a token", () => {
    expect(authorizePublicTrackingId(LEGACY, null)).toBeNull();
  });

  it("accepts a legacy id with a valid token", () => {
    const token = createTrackingToken(LEGACY)!;

    expect(authorizePublicTrackingId(LEGACY, token)).toBe(LEGACY);
  });

  it("refuses a modern id when the supplied token is invalid", () => {
    // A tampered signed link must not silently downgrade to the bare id.
    expect(authorizePublicTrackingId(MODERN, "not-a-valid-token")).toBeNull();
  });

  it("trims whitespace before checking", () => {
    expect(authorizePublicTrackingId(`  ${MODERN}  `, null)).toBe(MODERN);
  });
});

describe("createPublicTrackingUrl", () => {
  it("signs the link for a legacy id", () => {
    const token = createTrackingToken(LEGACY)!;

    expect(createPublicTrackingUrl(LEGACY)).toBe(
      `/track/${encodeURIComponent(LEGACY)}?token=${encodeURIComponent(token)}`
    );
  });

  it("signs the link for a modern id as well", () => {
    const token = createTrackingToken(MODERN)!;

    expect(createPublicTrackingUrl(MODERN)).toBe(
      `/track/${encodeURIComponent(MODERN)}?token=${encodeURIComponent(token)}`
    );
  });

  it("falls back to a bare link for a modern id when no secret exists", () => {
    vi.stubEnv("TRACKING_TOKEN_SECRET", "");
    vi.stubEnv("MFA_SESSION_SECRET", "");

    expect(createPublicTrackingUrl(MODERN)).toBe(
      `/track/${encodeURIComponent(MODERN)}`
    );
  });

  it("returns null for a legacy id when no secret exists", () => {
    vi.stubEnv("TRACKING_TOKEN_SECRET", "");
    vi.stubEnv("MFA_SESSION_SECRET", "");

    expect(createPublicTrackingUrl(LEGACY)).toBeNull();
  });
});
