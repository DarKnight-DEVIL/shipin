/**
 * `GET|POST /api/user/consent` — DPDP consent capture.
 *
 * Consent is the lawful basis for marketing and analytics processing, so the
 * route must reject a malformed decision rather than write a partial audit
 * entry, and must record who made the decision (ip / user-agent).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getUserConsentState: vi.fn(),
  getConsentLog: vi.fn(),
  getGrantedCategories: vi.fn(),
  updateUserConsent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuthWithProfile: mocks.auth }));
vi.mock("@/lib/compliance/consent", () => ({
  getUserConsentState: mocks.getUserConsentState,
  getConsentLog: mocks.getConsentLog,
  getGrantedCategories: mocks.getGrantedCategories,
  updateUserConsent: mocks.updateUserConsent,
}));

import { GET, POST } from "./route";

const request = (init?: { body?: unknown; headers?: Record<string, string> }) =>
  new NextRequest("http://localhost/api/user/consent", {
    method: init?.body === undefined ? "GET" : "POST",
    headers: init?.headers,
    ...(init?.body === undefined
      ? {}
      : {
          body:
            typeof init.body === "string"
              ? init.body
              : JSON.stringify(init.body),
        }),
  });

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ profile: { uid: "user-1" } });
  mocks.getUserConsentState.mockReset().mockResolvedValue({});
  mocks.getConsentLog.mockReset().mockResolvedValue([]);
  mocks.getGrantedCategories.mockReset().mockResolvedValue([]);
  mocks.updateUserConsent.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/user/consent", () => {
  it("passes an auth failure straight through", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.getUserConsentState).not.toHaveBeenCalled();
  });

  it("returns state, audit log and granted categories", async () => {
    mocks.getUserConsentState.mockResolvedValue({
      marketing: { granted: true, version: "v1" },
    });
    mocks.getConsentLog.mockResolvedValue([{ id: "log-1" }]);
    mocks.getGrantedCategories.mockResolvedValue(["marketing"]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      consentState: { marketing: { granted: true, version: "v1" } },
      consentLog: [{ id: "log-1" }],
      grantedCategories: ["marketing"],
    });
    expect(mocks.getConsentLog).toHaveBeenCalledWith("user-1", 50);
  });
});

describe("POST /api/user/consent", () => {
  const valid = {
    category: "marketing",
    granted: true,
    version: "v2",
    method: "explicit",
  };

  it("rejects an auth failure", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    expect((await POST(request({ body: valid }))).status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request({ body: "{oops" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_JSON");
  });

  it.each([
    [{ granted: true, version: "v2" }, "Category is required."],
    [
      { category: "marketing", granted: "yes", version: "v2" },
      "Granted must be boolean.",
    ],
    [{ category: "marketing", granted: true }, "Version is required."],
    [
      {
        category: "marketing",
        granted: true,
        version: "v2",
        method: "implied",
      },
      "Invalid method.",
    ],
  ])("rejects %j", async (payload, message) => {
    const response = await POST(request({ body: payload }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(message);
    expect(mocks.updateUserConsent).not.toHaveBeenCalled();
  });

  it("records the decision with forwarded client metadata", async () => {
    const response = await POST(
      request({
        body: valid,
        headers: {
          "x-forwarded-for": "203.0.113.5, 10.0.0.1",
          "user-agent": "Mozilla/5.0",
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Consent granted");
    expect(mocks.updateUserConsent).toHaveBeenCalledWith({
      userId: "user-1",
      category: "marketing",
      granted: true,
      version: "v2",
      method: "explicit",
      // The rightmost hop is the one the nearest proxy appended; the leftmost
      // can be typed by the client, so it is not an audit record.
      ip: "10.0.0.1",
      userAgent: "Mozilla/5.0",
    });
  });

  it("ignores a spoofed forwarded address when the platform supplies one", async () => {
    await POST(
      request({
        body: valid,
        headers: {
          "x-vercel-forwarded-for": "198.51.100.9",
          "x-forwarded-for": "1.2.3.4",
          "cf-connecting-ip": "8.8.8.8",
        },
      })
    );

    expect(mocks.updateUserConsent).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "198.51.100.9" })
    );
  });

  it("defaults unknown metadata and the method", async () => {
    const response = await POST(
      request({
        body: { category: "analytics", granted: false, version: "v1" },
      })
    );

    expect((await response.json()).message).toBe("Consent withdrawn");
    expect(mocks.updateUserConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "explicit",
        ip: "unknown",
        userAgent: "unknown",
      })
    );
  });

  it("prefers x-real-ip when there is no forwarded chain", async () => {
    await POST(
      request({
        body: valid,
        headers: { "x-real-ip": "198.51.100.7" },
      })
    );

    expect(mocks.updateUserConsent).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "198.51.100.7" })
    );
  });
});
