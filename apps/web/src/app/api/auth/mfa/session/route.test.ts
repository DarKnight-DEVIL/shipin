import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  verifyAppCheckRequest: vi.fn(),
  getUser: vi.fn(),
  update: vi.fn(),
  availableMfaMethods: vi.fn(),
  verifyMfaProof: vi.fn(),
  isChallengeExpired: vi.fn(),
  readStoredCredentials: vi.fn(),
  verifyAssertion: vi.fn(),
  getMfaSession: vi.fn(),
  revokeMfaSession: vi.fn(),
  createMfaSessionToken: vi.fn(),
  createMfaSessionCookieHeader: vi.fn(),
  clearMfaSessionCookieHeader: vi.fn(),
  record: vi.fn(),
  isRateLimited: vi.fn(),
  addRateLimitHeaders: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.getUser, update: mocks.update }),
    }),
  },
}));
vi.mock("@/lib/appCheck", () => ({
  verifyAppCheckRequest: mocks.verifyAppCheckRequest,
}));
vi.mock("@/lib/mfaProof", () => ({
  availableMfaMethods: mocks.availableMfaMethods,
  verifyMfaProof: mocks.verifyMfaProof,
}));
vi.mock("@/lib/webauthn", () => ({
  isChallengeExpired: mocks.isChallengeExpired,
  readStoredCredentials: mocks.readStoredCredentials,
  verifyAssertion: mocks.verifyAssertion,
}));
vi.mock("@/lib/mfaSession", () => ({
  MFA_SESSION_TTL_MS: 900_000,
  getMfaSession: mocks.getMfaSession,
  revokeMfaSession: mocks.revokeMfaSession,
  createMfaSessionToken: mocks.createMfaSessionToken,
  createMfaSessionCookieHeader: mocks.createMfaSessionCookieHeader,
  clearMfaSessionCookieHeader: mocks.clearMfaSessionCookieHeader,
}));
vi.mock("@/lib/rateLimiter", () => ({
  loginRateLimiter: { record: mocks.record },
  isRateLimited: mocks.isRateLimited,
  addRateLimitHeaders: mocks.addRateLimitHeaders,
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: () => "__DELETE__",
    serverTimestamp: () => "__SERVER_TS__",
  },
}));

import { DELETE, GET, POST } from "./route";

const authRequest = (body?: unknown) =>
  new NextRequest("http://localhost/api/auth/mfa/session", {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: "Bearer token-1" },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

const adminProfile = {
  role: "admin",
  mfa: {
    webauthn: {
      credentials: [{ credentialID: "cred-1", counter: 1 }],
      pendingChallenge: "challenge-1",
      pendingExpires: Date.now() + 60_000,
    },
  },
};

const limit = { allowed: true };

beforeEach(() => {
  mocks.verifyIdToken.mockReset().mockResolvedValue({
    uid: "admin-1",
    email: "a@x.com",
    email_verified: true,
  });
  mocks.verifyAppCheckRequest.mockReset().mockResolvedValue("not-enforced");
  mocks.getUser
    .mockReset()
    .mockResolvedValue({ exists: true, data: () => adminProfile });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.availableMfaMethods.mockReset().mockReturnValue(["totp"]);
  mocks.verifyMfaProof
    .mockReset()
    .mockReturnValue({ ok: true, method: "totp" });
  mocks.isChallengeExpired.mockReset().mockReturnValue(false);
  mocks.readStoredCredentials
    .mockReset()
    .mockReturnValue([{ credentialID: "cred-1", counter: 1 }]);
  mocks.verifyAssertion
    .mockReset()
    .mockResolvedValue({ verified: true, newCounter: 2 });
  mocks.getMfaSession.mockReset().mockResolvedValue(null);
  mocks.revokeMfaSession.mockReset().mockResolvedValue(undefined);
  mocks.createMfaSessionToken
    .mockReset()
    .mockReturnValue({ token: "elevated", expiresAt: 42 });
  mocks.createMfaSessionCookieHeader
    .mockReset()
    .mockReturnValue("mfa_session=elevated");
  mocks.clearMfaSessionCookieHeader.mockReset().mockReturnValue("mfa_session=");
  mocks.record.mockReset().mockResolvedValue(limit);
  mocks.isRateLimited.mockReset().mockReturnValue(false);
  mocks.addRateLimitHeaders.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/auth/mfa/session", () => {
  it("requires a bearer token", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/auth/mfa/session")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" })
    );
  });

  it("rejects a token Firebase cannot verify", async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error("bad"));

    const response = await GET(authRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "INVALID_AUTHENTICATION" })
    );
  });

  it("rejects a missing profile", async () => {
    mocks.getUser.mockResolvedValue({ exists: false });

    const response = await GET(authRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "USER_PROFILE_NOT_FOUND" })
    );
  });

  it("rejects non-admin callers", async () => {
    mocks.getUser.mockResolvedValue({
      exists: true,
      data: () => ({ role: "customer" }),
    });

    const response = await GET(authRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "ADMIN_ACCESS_REQUIRED" })
    );
  });

  it("reports a non-elevated session", async () => {
    const response = await GET(authRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      elevated: false,
      expiresAt: null,
      methods: ["totp"],
      sessionTtlMs: 900_000,
    });
  });

  it("reports an elevated session for the same admin", async () => {
    mocks.getMfaSession.mockReturnValue({ uid: "admin-1", expiresAt: 42 });

    const response = await GET(authRequest());

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ elevated: true, expiresAt: 42 })
    );
  });

  it("elevates a token Firebase already raised with a second factor", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      uid: "admin-1",
      email: "a@x.com",
      email_verified: true,
      firebase: { sign_in_second_factor: "phone" },
    });

    const response = await GET(authRequest());

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ elevated: true })
    );
  });

  it("does not elevate another user's session", async () => {
    mocks.getMfaSession.mockReturnValue({ uid: "someone-else", expiresAt: 42 });

    const response = await GET(authRequest());

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ elevated: false, expiresAt: null })
    );
  });
});

describe("POST /api/auth/mfa/session", () => {
  it("refuses to mint an elevated session without a valid App Check token", async () => {
    mocks.verifyAppCheckRequest.mockResolvedValue("missing");

    const response = await POST(
      authRequest({ method: "totp", code: "123456" })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "APP_CHECK_FAILED" })
    );
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it("refuses an administrator whose email is not verified", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      uid: "admin-1",
      email_verified: false,
    });

    const response = await POST(
      authRequest({ method: "totp", code: "123456" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "EMAIL_VERIFICATION_REQUIRED" })
    );
  });

  it("rate limits verification attempts", async () => {
    mocks.isRateLimited.mockReturnValue(true);

    const response = await POST(
      authRequest({ method: "totp", code: "123456" })
    );

    expect(response.status).toBe(429);
    expect(mocks.addRateLimitHeaders).toHaveBeenCalled();
    expect(mocks.verifyMfaProof).not.toHaveBeenCalled();
  });

  it("serves the attempt when the shared limiter store is unavailable", async () => {
    // A store-less production deployment (and the local E2E run) reports
    // `unavailable`, not an over-limit client. Treating it as abuse answered
    // 429 for every elevation, which is how this was found.
    mocks.isRateLimited.mockReturnValue(true);
    mocks.record.mockResolvedValue({
      ok: false,
      unavailable: true,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(
      authRequest({ method: "totp", code: "123456" })
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyMfaProof).toHaveBeenCalled();
    expect(mocks.addRateLimitHeaders).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body", async () => {
    const response = await POST(authRequest("not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "INVALID_REQUEST_BODY" })
    );
  });

  it("rejects a malformed WebAuthn assertion", async () => {
    const response = await POST(
      authRequest({ method: "webauthn", credential: { id: "x" } })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "WEBAUTHN_INVALID_RESPONSE" })
    );
  });

  it("requires a registered security key", async () => {
    mocks.readStoredCredentials.mockReturnValue([]);

    const response = await POST(
      authRequest({ method: "webauthn", credential: validAssertion() })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "MFA_SETUP_REQUIRED" })
    );
  });

  it("rejects a missing or expired challenge", async () => {
    mocks.getUser.mockResolvedValue({
      exists: true,
      data: () => ({ role: "admin", mfa: {} }),
    });

    const response = await POST(
      authRequest({ method: "webauthn", credential: validAssertion() })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "WEBAUTHN_CHALLENGE_EXPIRED" })
    );
  });

  it("rejects a challenge the clock has passed", async () => {
    mocks.isChallengeExpired.mockReturnValue(true);

    const response = await POST(
      authRequest({ method: "webauthn", credential: validAssertion() })
    );

    expect(response.status).toBe(400);
    expect(mocks.verifyAssertion).not.toHaveBeenCalled();
  });

  it("rejects an unknown credential and burns the challenge", async () => {
    mocks.readStoredCredentials.mockReturnValue([
      { credentialID: "someone-else", counter: 1 },
    ]);

    const response = await POST(
      authRequest({ method: "webauthn", credential: validAssertion() })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "WEBAUTHN_UNKNOWN_CREDENTIAL" })
    );
    expect(mocks.update).toHaveBeenCalledWith({
      "mfa.webauthn.pendingChallenge": null,
      "mfa.webauthn.pendingExpires": null,
    });
  });

  it("rejects a failed signature and burns the challenge", async () => {
    mocks.readStoredCredentials.mockReturnValue([
      { credentialID: "other", counter: 1 },
    ]);
    mocks.verifyAssertion.mockResolvedValue({ verified: false });

    const response = await POST(
      authRequest({ method: "webauthn", credential: validAssertion("other") })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "MFA_INVALID_CODE" })
    );
    expect(mocks.update).toHaveBeenCalled();
  });

  it("elevates after a verified security key and stores the counter", async () => {
    const response = await POST(
      authRequest({ method: "webauthn", credential: validAssertion() })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        elevated: true,
        method: "webauthn",
        expiresAt: 42,
      })
    );
    expect(response.headers.get("set-cookie")).toContain(
      "mfa_session=elevated"
    );
    expect(mocks.update).toHaveBeenCalledWith({
      "mfa.webauthn.credentials": [{ credentialID: "cred-1", counter: 2 }],
      "mfa.webauthn.pendingChallenge": null,
      "mfa.webauthn.pendingExpires": null,
    });
  });

  it("requires a verification code", async () => {
    const response = await POST(authRequest({ method: "totp", code: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "MFA_CODE_REQUIRED" })
    );
  });

  it("reports an account with no MFA configured", async () => {
    mocks.verifyMfaProof.mockReturnValue({
      ok: false,
      reason: "NO_MFA_CONFIGURED",
    });

    const response = await POST(
      authRequest({ method: "totp", code: "123456" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "MFA_SETUP_REQUIRED" })
    );
  });

  it("rejects an incorrect code", async () => {
    mocks.verifyMfaProof.mockReturnValue({ ok: false, reason: "MISMATCH" });

    const response = await POST(
      authRequest({ method: "totp", code: "000000" })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "MFA_INVALID_CODE" })
    );
  });

  it("treats an unknown method as unspecified", async () => {
    const response = await POST(
      authRequest({ method: "carrier-pigeon", code: "123456" })
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyMfaProof).toHaveBeenCalledWith(adminProfile, {
      totp: undefined,
      backup: undefined,
    });
  });
});

const deleteRequest = (authorization?: string) =>
  new NextRequest("http://localhost/api/auth/mfa/session", {
    method: "DELETE",
    ...(authorization ? { headers: { authorization } } : {}),
  });

describe("DELETE /api/auth/mfa/session", () => {
  it("requires a bearer token", async () => {
    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" })
    );
    // No cookie is touched for an unauthenticated caller.
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects an invalid token without touching the cookie", async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error("bad token"));

    const response = await DELETE(deleteRequest("Bearer stale-token"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "INVALID_AUTHENTICATION" })
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("clears the elevated cookie for a valid token", async () => {
    const response = await DELETE(deleteRequest("Bearer token-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      elevated: false,
    });
    expect(response.headers.get("set-cookie")).toContain("mfa_session=");
    expect(mocks.verifyIdToken).toHaveBeenCalledWith("token-1");
  });

  it("revokes the session server-side, not just in this browser", async () => {
    const session = { uid: "admin-1", expiresAt: 1234, jti: "jti-1" };
    mocks.getMfaSession.mockResolvedValue(session);

    const response = await DELETE(deleteRequest("Bearer token-1"));

    expect(response.status).toBe(200);
    // A copied token has to stop verifying too, which only the denylist does.
    expect(mocks.revokeMfaSession).toHaveBeenCalledWith(session);
  });

  it("still clears the cookie when there is no session to revoke", async () => {
    const response = await DELETE(deleteRequest("Bearer token-1"));

    expect(response.status).toBe(200);
    expect(mocks.revokeMfaSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("mfa_session=");
  });

  it("clears the cookie even when the role is no longer admin", async () => {
    // A revoked admin must still be able to drop their own elevation; the
    // cookie is useless without the role, so demanding it here only strands it.
    mocks.getUser.mockResolvedValue({
      exists: true,
      data: () => ({ role: "customer" }),
    });

    const response = await DELETE(deleteRequest("Bearer token-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mfa_session=");
  });
});

function validAssertion(id = "cred-1") {
  return {
    id,
    rawId: id,
    type: "public-key",
    response: { clientDataJSON: "x", authenticatorData: "y", signature: "z" },
  };
}
