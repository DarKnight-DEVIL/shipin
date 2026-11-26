// @vitest-environment node

/**
 * `POST /api/auth/verify-email-link` - redeeming the permanent link.
 *
 * The route is anonymous, so every refusal is the security boundary: an unknown token,
 * a spent one, a superseded one, and a token issued for an address the account no longer
 * has. The success case is checked for what actually unblocks the customer - the Auth
 * flag - and for the version bump that retires the link.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  profileGet: vi.fn(),
  profileSet: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.profileGet, set: mocks.profileSet }),
    }),
  },
}));

import {
  VERIFICATION_VERSION_FIELD,
  issueVerificationToken,
} from "@/lib/emailVerificationTokens";

import { POST } from "./route";

const SECRET = "s".repeat(48);

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/auth/verify-email-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** A snapshot double: the route reads one field, not the whole document. */
const snapshot = (fields: Record<string, unknown> = {}, exists = true) => ({
  exists,
  get: (key: string) => fields[key],
});

const tokenFor = (version = 0, email = "customer@example.com", uid = "user-1") =>
  issueVerificationToken({ uid, email, version, secret: SECRET });

beforeEach(() => {
  vi.stubEnv("EMAIL_VERIFICATION_SECRET", SECRET);
  mocks.getUser.mockReset().mockResolvedValue({
    uid: "user-1",
    email: "customer@example.com",
    emailVerified: false,
  });
  mocks.updateUser.mockReset().mockResolvedValue(undefined);
  mocks.profileGet.mockReset().mockResolvedValue(snapshot({}));
  mocks.profileSet.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/auth/verify-email-link", () => {
  it("verifies the account and retires the link", async () => {
    const response = await POST(request({ token: tokenFor() }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      alreadyVerified: false,
      uid: "user-1",
      tokenRefreshRequired: true,
    });
    expect(mocks.updateUser).toHaveBeenCalledWith("user-1", {
      emailVerified: true,
    });
    // The bump is what makes the link single-use.
    expect(mocks.profileSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailVerified: true,
        [VERIFICATION_VERSION_FIELD]: 1,
      }),
      { merge: true }
    );
  });

  it("refuses a token that has already been used, because the version moved on", async () => {
    mocks.profileGet.mockResolvedValue(snapshot({ [VERIFICATION_VERSION_FIELD]: 1 }));

    const response = await POST(request({ token: tokenFor(0) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_OR_USED_TOKEN",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a token issued for an address the account no longer has", async () => {
    mocks.getUser.mockResolvedValue({
      uid: "user-1",
      email: "new-address@example.com",
      emailVerified: false,
    });

    const response = await POST(request({ token: tokenFor() }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_OR_USED_TOKEN",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a token signed with another secret", async () => {
    const foreign = issueVerificationToken({
      uid: "user-1",
      email: "customer@example.com",
      version: 0,
      secret: "x".repeat(48),
    });

    const response = await POST(request({ token: foreign }));

    expect(response.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses junk without touching Firestore or Auth", async () => {
    const response = await POST(request({ token: "not-a-real-token" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("treats a second click as success rather than an error", async () => {
    mocks.getUser.mockResolvedValue({
      uid: "user-1",
      email: "customer@example.com",
      emailVerified: true,
    });

    const response = await POST(request({ token: tokenFor() }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      alreadyVerified: true,
    });
    // Nothing to change in Auth, and still no replay: the version moves on.
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.profileSet).toHaveBeenCalledWith(
      expect.objectContaining({ [VERIFICATION_VERSION_FIELD]: 1 }),
      { merge: true }
    );
  });

  it("answers 404 for an account that no longer exists", async () => {
    mocks.getUser.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "auth/user-not-found" })
    );

    const response = await POST(request({ token: tokenFor() }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("names a missing signing secret instead of blaming the link", async () => {
    vi.stubEnv("EMAIL_VERIFICATION_SECRET", "");
    vi.stubEnv("MFA_SESSION_SECRET", "");

    const response = await POST(request({ token: tokenFor() }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "LINK_SIGNING_NOT_CONFIGURED",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("leaves the link usable when the Auth update fails", async () => {
    mocks.updateUser.mockRejectedValue(new Error("auth down"));

    const response = await POST(request({ token: tokenFor() }));

    // 500 from the error wrapper, and crucially no version bump: the customer is still
    // unverified, so retiring the link would leave them with nothing to click.
    expect(response.status).toBe(500);
    expect(mocks.profileSet).not.toHaveBeenCalled();
  });
});
