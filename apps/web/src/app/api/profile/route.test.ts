import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  extractAuth: vi.fn(),
  verifyIdToken: vi.fn(),
  requireAuthAccount: vi.fn(),
  requireAuthWithProfile: vi.fn(),
  verifyAppCheckRequest: vi.fn(),
  recordAppCheckRejection: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  extractAuth: mocks.extractAuth,
  verifyIdToken: mocks.verifyIdToken,
  requireAuthAccount: mocks.requireAuthAccount,
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));
vi.mock("@/lib/appCheck", () => ({
  verifyAppCheckRequest: mocks.verifyAppCheckRequest,
}));
vi.mock("@/lib/appCheckMetrics", () => ({
  recordAppCheckRejection: mocks.recordAppCheckRejection,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        create: mocks.create,
        update: mocks.update,
      })),
    })),
  },
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));

import { GET, PATCH, POST } from "./route";

const request = (body: unknown, method = "POST") =>
  new NextRequest("http://localhost/api/profile", {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.extractAuth.mockReset().mockReturnValue("token-1");
  mocks.verifyIdToken
    .mockReset()
    .mockResolvedValue({ uid: "user-1", email: "ada@example.com" });
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: "user-1" } });
  mocks.verifyAppCheckRequest.mockReset().mockResolvedValue("ok");
  mocks.recordAppCheckRejection.mockReset();
  mocks.create.mockReset().mockResolvedValue(undefined);
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.requireAuthAccount.mockReset().mockResolvedValue({
    token: { uid: "user-1" },
    profile: {
      displayName: "Ada",
      email: "ada@example.com",
      phone: "+44",
    },
  });
});

describe("GET /api/profile", () => {
  it("returns a safe projection", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/profile")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      profile: {
        displayName: "Ada",
        email: "ada@example.com",
        phone: "+44",
      },
    });
  });

  it("returns null when the account has no profile", async () => {
    mocks.requireAuthAccount.mockResolvedValue({
      token: { uid: "user-1" },
      profile: null,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/profile")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      profile: null,
    });
  });

  it("never returns a legacy TOTP secret", async () => {
    mocks.requireAuthAccount.mockResolvedValue({
      token: { uid: "user-1" },
      profile: {
        displayName: "Ada",
        mfa: {
          totp: { enabled: true, secret: "JBSWY3DPEHPK3PXP" },
        },
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/profile")
    );
    const body = await response.json();

    expect(body.profile.mfa).toEqual({
      totp: { enabled: true },
      sms: { enabled: false },
      required: false,
    });
    expect(JSON.stringify(body)).not.toContain("JBSWY3DPEHPK3PXP");
  });

  it("passes the shared auth gate's rejection through", async () => {
    mocks.requireAuthAccount.mockResolvedValue(
      NextResponse.json(
        { success: false, code: "ACCOUNT_SUSPENDED" },
        { status: 403 }
      )
    );

    const response = await GET(
      new NextRequest("http://localhost/api/profile")
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACCOUNT_SUSPENDED",
    });
  });
});

describe("POST /api/profile", () => {
  it("requires a bearer token", async () => {
    mocks.extractAuth.mockReturnValue(null);

    const response = await POST(request({ displayName: "Ada" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Authentication required.",
    });
  });

  it("rejects an invalid token", async () => {
    mocks.verifyIdToken.mockResolvedValue(null);

    const response = await POST(request({ displayName: "Ada" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid authentication token.",
    });
  });

  it("fails closed when App Check rejects the request", async () => {
    mocks.verifyAppCheckRequest.mockResolvedValue("missing");

    const response = await POST(request({ displayName: "Ada" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "APP_CHECK_FAILED",
    });
    expect(mocks.recordAppCheckRejection).toHaveBeenCalledWith("missing");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body", async () => {
    const response = await POST(request("{broken"));

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires a display name", async () => {
    const response = await POST(request({ displayName: "   " }));

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates the profile with the verified email and ignores a body email", async () => {
    const response = await POST(
      request({
        displayName: "Ada",
        email: "attacker@example.com",
        phone: "+44",
      })
    );

    expect(mocks.create).toHaveBeenCalledWith({
      displayName: "Ada",
      email: "ada@example.com",
      phone: "+44",
      photoURL: "",
      updatedAt: "__SERVER_TS__",
      createdAt: "__SERVER_TS__",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("answers 409 instead of merging into an existing profile", async () => {
    mocks.create.mockRejectedValue({ code: 6 });

    const response = await POST(request({ displayName: "Ada" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "PROFILE_EXISTS",
    });
  });
});

describe("PATCH /api/profile", () => {
  it("passes the auth rejection through", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await PATCH(request({ displayName: "Ada" }, "PATCH"));

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body", async () => {
    const response = await PATCH(request("{broken", "PATCH"));

    expect(response.status).toBe(400);
  });

  it("rejects an empty update", async () => {
    const response = await PATCH(request({}, "PATCH"));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not let the client write email", async () => {
    const response = await PATCH(
      request({ email: "attacker@example.com" }, "PATCH")
    );

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates only the supplied fields", async () => {
    const response = await PATCH(request({ displayName: "Ada L" }, "PATCH"));

    expect(mocks.update).toHaveBeenCalledWith({
      displayName: "Ada L",
      updatedAt: "__SERVER_TS__",
    });
    expect(response.status).toBe(200);
  });
});
