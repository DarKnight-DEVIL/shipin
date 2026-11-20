/**
 * `POST|GET /api/user/age-verification` — DPDP Sec 9 parental consent.
 *
 * A minor's account may only transact after a verified parental consent, so
 * every action is validated before the compliance helpers are called.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyParentalConsent: vi.fn(),
  verifyParentalConsentOTP: vi.fn(),
  hasParentalConsent: vi.fn(),
  enforceAgeGate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuthWithProfile: mocks.auth }));
vi.mock("@/lib/compliance/ageOps", () => ({
  verifyParentalConsent: mocks.verifyParentalConsent,
  verifyParentalConsentOTP: mocks.verifyParentalConsentOTP,
  hasParentalConsent: mocks.hasParentalConsent,
  enforceAgeGate: mocks.enforceAgeGate,
}));

import { GET, POST } from "./route";

const request = (body?: unknown) =>
  new NextRequest("http://localhost/api/user/age-verification", {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : {
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
  });

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ profile: { uid: "child-1" } });
  mocks.verifyParentalConsent
    .mockReset()
    .mockResolvedValue({ success: true, consentId: "consent-1" });
  mocks.verifyParentalConsentOTP
    .mockReset()
    .mockResolvedValue({ success: true });
  mocks.hasParentalConsent.mockReset().mockResolvedValue(false);
  mocks.enforceAgeGate.mockReset().mockResolvedValue({ allowed: true });
});

describe("POST /api/user/age-verification", () => {
  it("rejects an auth failure", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );
    expect((await POST(request({ action: "check" }))).status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("{bad"));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_JSON");
  });

  it("requires a parent email when requesting consent", async () => {
    const response = await POST(request({ action: "request" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Parent email required.");
  });

  it("requires a supported consent method", async () => {
    const response = await POST(
      request({
        action: "request",
        parentEmail: "parent@example.com",
        method: "sms",
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Valid method required/);
  });

  it("creates a parental consent request", async () => {
    const response = await POST(
      request({
        action: "request",
        parentEmail: "parent@example.com",
        method: "otp",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      consentId: "consent-1",
    });
    expect(mocks.verifyParentalConsent).toHaveBeenCalledWith({
      childUid: "child-1",
      parentEmail: "parent@example.com",
      consentMethod: "otp",
    });
  });

  it("requires a consent id when verifying an OTP", async () => {
    const response = await POST(
      request({ action: "verify-otp", otp: "123456" })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Consent ID required.");
  });

  it("requires the OTP itself", async () => {
    const response = await POST(
      request({ action: "verify-otp", consentId: "consent-1" })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("OTP required.");
  });

  it("delegates OTP verification", async () => {
    const response = await POST(
      request({ action: "verify-otp", consentId: "consent-1", otp: "123456" })
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyParentalConsentOTP).toHaveBeenCalledWith({
      consentId: "consent-1",
      otp: "123456",
    });
  });

  it("reports the age gate for the check action", async () => {
    mocks.enforceAgeGate.mockResolvedValue({
      allowed: false,
      error: "Parental consent required",
    });

    const response = await POST(request({ action: "check" }));

    expect(await response.json()).toEqual({
      allowed: false,
      error: "Parental consent required",
    });
  });

  it("rejects an unknown action", async () => {
    const response = await POST(request({ action: "explode" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Unknown action.");
  });
});

describe("GET /api/user/age-verification", () => {
  it("rejects an auth failure", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );
    expect((await GET(request())).status).toBe(401);
  });

  it("returns the consent flag and age gate", async () => {
    mocks.hasParentalConsent.mockResolvedValue(true);

    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({
      success: true,
      parentalConsentVerified: true,
      ageGate: { allowed: true },
    });
    expect(mocks.hasParentalConsent).toHaveBeenCalledWith("child-1");
    expect(mocks.enforceAgeGate).toHaveBeenCalledWith("child-1");
  });
});
