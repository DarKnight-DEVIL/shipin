import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  revokeRefreshTokens: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: {
    getUser: mocks.getUser,
    updateUser: mocks.updateUser,
    revokeRefreshTokens: mocks.revokeRefreshTokens,
  },
}));
vi.mock("@/config/env", () => ({
  clientEnv: { NEXT_PUBLIC_FIREBASE_API_KEY: "test-key" },
}));

import { POST } from "./route";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/user/password", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: "user-1" },
    profile: { uid: "user-1" },
  });
  mocks.getUser.mockReset().mockResolvedValue({
    uid: "user-1",
    email: "ada@example.com",
    providerData: [{ providerId: "password" }],
  });
  mocks.updateUser.mockReset().mockResolvedValue(undefined);
  mocks.revokeRefreshTokens.mockReset().mockResolvedValue(undefined);
  mocks.fetch.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/user/password", () => {
  it("returns the auth failure untouched", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(request({}));

    expect(response.status).toBe(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("enforces the password policy on the server", async () => {
    const response = await POST(
      request({ currentPassword: "oldpass1", newPassword: "short" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "WEAK_PASSWORD" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses when the current password is wrong", async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    const response = await POST(
      request({ currentPassword: "wrongpass1", newPassword: "newpass123" })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("requires the current password for an account that has one", async () => {
    const response = await POST(request({ newPassword: "newpass123" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "CURRENT_PASSWORD_REQUIRED",
    });
  });

  it("changes the password and revokes other sessions", async () => {
    const response = await POST(
      request({ currentPassword: "oldpass1", newPassword: "newpass123" })
    );

    expect(response.status).toBe(200);
    expect(mocks.fetch.mock.calls[0][0]).toContain("signInWithPassword");
    expect(mocks.updateUser).toHaveBeenCalledWith("user-1", { password: "newpass123" });
    expect(mocks.revokeRefreshTokens).toHaveBeenCalledWith("user-1");
  });

  it("sets a first password without one when the account has no password provider", async () => {
    mocks.getUser.mockResolvedValue({
      uid: "user-1",
      email: "ada@example.com",
      providerData: [{ providerId: "google.com" }],
    });

    const response = await POST(request({ newPassword: "newpass123" }));

    expect(response.status).toBe(200);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.updateUser).toHaveBeenCalledWith("user-1", { password: "newpass123" });
  });
});
