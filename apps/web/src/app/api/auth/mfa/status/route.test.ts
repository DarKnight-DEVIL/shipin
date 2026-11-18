import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  readStoredCredentials: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: { getUser: mocks.getUser },
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get })) })),
  },
}));
vi.mock("@/lib/webauthn", () => ({
  readStoredCredentials: mocks.readStoredCredentials,
}));

import { GET } from "./route";

const request = () => new NextRequest("http://localhost/api/auth/mfa/status");

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: "admin-1", role: "admin" } });
  mocks.get.mockReset();
  mocks.readStoredCredentials.mockReset().mockReturnValue([]);
  mocks.getUser
    .mockReset()
    .mockResolvedValue({ multiFactor: { enrolledFactors: [] } });
});

describe("GET /api/auth/mfa/status", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("serves a customer their own MFA status", async () => {
    // Self-service: a customer manages their own second factor, so the old
    // admin-only gate must not apply. The route still authenticates the caller.
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: "user-1", role: "customer" },
      token: {},
    });

    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ mfa: { totp: { enabled: true, secret: "SECRET" } } }),
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      totp: { enabled: true },
    });
    expect(mocks.get).toHaveBeenCalled();
  });

  it("404s when the profile is missing", async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await GET(request());

    expect(response.status).toBe(404);
  });

  it("reports only safe facts about every factor", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({
        mfa: {
          totp: {
            enabled: true,
            secret: "SECRET",
            backupCodes: ["a", "b", "c"],
          },
          webauthn: { credentials: [] },
        },
      }),
    });
    // SMS now comes from the Firebase Auth user, not Firestore.
    mocks.getUser.mockResolvedValue({
      multiFactor: {
        enrolledFactors: [
          { factorId: "phone", phoneNumber: "+44 7700 900123" },
        ],
      },
    });
    mocks.readStoredCredentials.mockReturnValue([
      {
        credentialID: "cred-1",
        name: "YubiKey",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({
      success: true,
      totp: { enabled: true, pending: false },
      sms: { enabled: true, phoneNumber: "••• ••• 0123" },
      backupCodes: 3,
      webauthn: {
        enabled: true,
        credentials: [
          {
            id: "cred-1",
            name: "YubiKey",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("reports an unconfirmed enrolment as pending", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ mfa: { totp: { secret: "SECRET" } } }),
    });

    const body = await (await GET(request())).json();

    expect(body.totp).toEqual({ enabled: false, pending: true });
  });

  it("hides a phone number that is too short to mask", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({}) });
    mocks.getUser.mockResolvedValue({
      multiFactor: {
        enrolledFactors: [{ factorId: "phone", phoneNumber: "12" }],
      },
    });

    const body = await (await GET(request())).json();

    /* The factor is enabled; only the mask is withheld. */
    expect(body.sms).toEqual({ enabled: true, phoneNumber: null });
  });

  it("ignores a legacy Firestore SMS record", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({
        mfa: { sms: { enabled: true, phoneNumber: "+15551234567" } },
      }),
    });

    const body = await (await GET(request())).json();

    expect(body.sms).toEqual({ enabled: false, phoneNumber: null });
  });

  it("handles a document without MFA settings", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => ({}) });

    const body = await (await GET(request())).json();

    expect(body).toMatchObject({
      totp: { enabled: false, pending: false },
      sms: { enabled: false, phoneNumber: null },
      backupCodes: 0,
      webauthn: { enabled: false, credentials: [] },
    });
  });
});
