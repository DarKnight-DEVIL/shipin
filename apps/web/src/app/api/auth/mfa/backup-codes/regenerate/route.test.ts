import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  profileGet: vi.fn(),
  secretsGet: vi.fn(),
  secretUpdate: vi.fn(),
  generateBackupCodes: vi.fn(),
  hashBackupCode: vi.fn((code: string) => `hash:${code}`),
  verifyTotp: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({
        get: name === "userSecrets" ? mocks.secretsGet : mocks.profileGet,
        update: mocks.secretUpdate,
      })),
    })),
  },
}));
vi.mock("@/lib/mfa", () => ({
  generateBackupCodes: mocks.generateBackupCodes,
  hashBackupCode: mocks.hashBackupCode,
  verifyTotp: mocks.verifyTotp,
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));

import { POST } from "./route";

const request = (body: unknown = { totpCode: "123456" }) =>
  new NextRequest("http://localhost/api/auth/mfa/backup-codes/regenerate", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: "admin-1", role: "admin" } });
  mocks.profileGet.mockReset().mockResolvedValue({
    exists: true,
    data: () => ({ mfa: { totp: { enabled: true } } }),
  });
  mocks.secretsGet.mockReset().mockResolvedValue({
    exists: true,
    data: () => ({ totp: { secret: "SECRET", backupCodes: [] } }),
  });
  mocks.secretUpdate.mockReset().mockResolvedValue(undefined);
  mocks.generateBackupCodes.mockReset().mockReturnValue(["CODE-1", "CODE-2"]);
  mocks.verifyTotp.mockReset().mockReturnValue(true);
});

describe("POST /api/auth/mfa/backup-codes/regenerate", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.secretUpdate).not.toHaveBeenCalled();
  });

  it("lets a customer regenerate their own backup codes", async () => {
    // Self-service: a customer manages their own second factor, so the old
    // admin-only gate must not apply. The route still authenticates the caller.
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: "user-1", role: "customer" },
      token: {},
    });

    const response = await POST(request());

    expect(response.status).not.toBe(403);
    expect(mocks.profileGet).toHaveBeenCalled();
  });

  it("requires a six digit code", async () => {
    const response = await POST(request({ totpCode: "123" }));

    expect(response.status).toBe(400);
    expect(mocks.profileGet).not.toHaveBeenCalled();
  });

  it("404s when the admin profile is missing", async () => {
    mocks.profileGet.mockResolvedValue({ exists: false });

    const response = await POST(request());

    expect(response.status).toBe(404);
  });

  it("refuses when TOTP is not enabled", async () => {
    mocks.profileGet.mockResolvedValue({
      exists: true,
      data: () => ({ mfa: { totp: {} } }),
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "TOTP_NOT_SETUP",
    });
    expect(mocks.secretUpdate).not.toHaveBeenCalled();
  });

  it("rejects a wrong TOTP code", async () => {
    mocks.verifyTotp.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_TOTP_CODE",
    });
    expect(mocks.secretUpdate).not.toHaveBeenCalled();
  });

  it("generates ten fresh hashed codes", async () => {
    const response = await POST(request());

    expect(mocks.generateBackupCodes).toHaveBeenCalledWith(10);
    expect(mocks.verifyTotp).toHaveBeenCalledWith("SECRET", "123456", 1);
    expect(mocks.secretUpdate).toHaveBeenCalledWith({
      "totp.backupCodes": ["hash:CODE-1", "hash:CODE-2"],
      updatedAt: "__SERVER_TS__",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      backupCodes: ["CODE-1", "CODE-2"],
    });
  });
});
