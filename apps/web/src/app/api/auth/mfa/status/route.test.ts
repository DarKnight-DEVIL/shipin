import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  profileGet: vi.fn(),
  secretsGet: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: { getUser: mocks.getUser },
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({
        get: name === "userSecrets" ? mocks.secretsGet : mocks.profileGet,
      })),
    })),
  },
}));

import { GET } from "./route";

const request = () => new NextRequest("http://localhost/api/auth/mfa/status");

const profile = (data: Record<string, unknown>) => ({
  exists: true,
  data: () => data,
});

const secrets = (totp?: Record<string, unknown>) => ({
  exists: totp !== undefined,
  data: () => (totp ? { totp } : undefined),
});

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: "admin-1", role: "admin" } });
  mocks.profileGet
    .mockReset()
    .mockResolvedValue(profile({ mfa: { totp: { enabled: true } } }));
  mocks.secretsGet
    .mockReset()
    .mockResolvedValue(secrets({ secret: "SECRET", backupCodes: ["a"] }));
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
    expect(mocks.profileGet).not.toHaveBeenCalled();
  });

  it("serves a customer their own MFA status", async () => {
    // Self-service: a customer manages their own second factor, so the old
    // admin-only gate must not apply. The route still authenticates the caller.
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: "user-1", role: "customer" },
      token: {},
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      totp: { enabled: true },
    });
    expect(mocks.profileGet).toHaveBeenCalled();
    expect(mocks.secretsGet).toHaveBeenCalled();
  });

  it("404s when the profile is missing", async () => {
    mocks.profileGet.mockResolvedValue({ exists: false });

    const response = await GET(request());

    expect(response.status).toBe(404);
  });

  it("reports only safe facts about every factor", async () => {
    mocks.profileGet.mockResolvedValue(
      profile({
        mfa: {
          totp: { enabled: true },
          webauthn: { credentials: [] },
        },
      })
    );
    mocks.secretsGet.mockResolvedValue(
      secrets({ secret: "SECRET", backupCodes: ["a", "b", "c"] })
    );
    // SMS now comes from the Firebase Auth user, not Firestore.
    mocks.getUser.mockResolvedValue({
      multiFactor: {
        enrolledFactors: [
          { factorId: "phone", phoneNumber: "+44 7700 900123" },
        ],
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({
      success: true,
      totp: { enabled: true, pending: false },
      sms: { enabled: true, phoneNumber: "••• ••• 0123" },
      backupCodes: 3,
    });
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(JSON.stringify(body)).not.toContain("hash");
  });

  it("reports an unconfirmed enrolment as pending", async () => {
    mocks.profileGet.mockResolvedValue(
      profile({ mfa: { totp: { enabled: false } } })
    );
    mocks.secretsGet.mockResolvedValue(secrets({ secret: "SECRET" }));

    const body = await (await GET(request())).json();

    expect(body.totp).toEqual({ enabled: false, pending: true });
  });

  it("does not report enabled when the secret record is gone", async () => {
    // The public flag alone is not proof: reset deletes the secret first.
    mocks.profileGet.mockResolvedValue(
      profile({ mfa: { totp: { enabled: true } } })
    );
    mocks.secretsGet.mockResolvedValue(secrets());

    const body = await (await GET(request())).json();

    expect(body.totp).toEqual({ enabled: false, pending: false });
    expect(body.backupCodes).toBe(0);
  });

  it("hides a phone number that is too short to mask", async () => {
    mocks.profileGet.mockResolvedValue(profile({}));
    mocks.secretsGet.mockResolvedValue(secrets());
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
    mocks.profileGet.mockResolvedValue(
      profile({
        mfa: { sms: { enabled: true, phoneNumber: "+15551234567" } },
      })
    );
    mocks.secretsGet.mockResolvedValue(secrets());

    const body = await (await GET(request())).json();

    expect(body.sms).toEqual({ enabled: false, phoneNumber: null });
  });

  it("handles a document without MFA settings", async () => {
    mocks.profileGet.mockResolvedValue(profile({}));
    mocks.secretsGet.mockResolvedValue(secrets());

    const body = await (await GET(request())).json();

    expect(body).toMatchObject({
      totp: { enabled: false, pending: false },
      sms: { enabled: false, phoneNumber: null },
      backupCodes: 0,
    });
  });
});
