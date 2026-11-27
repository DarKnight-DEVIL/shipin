// @vitest-environment node

/**
 * `POST /api/auth/resend-verification`.
 *
 * The one endpoint an unverified account must be able to reach, so the cases that
 * matter are the ones that would leave somebody stuck: it must not apply the guard
 * that blocks unverified users, it must not mail an already-verified address, and a
 * failed send must not start the cooldown (otherwise the failure locks them out of
 * retrying the fix for it).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  generateEmailVerificationLink: vi.fn(),
  sendMail: vi.fn(),
  profileGet: vi.fn(),
  profileSet: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: {
    verifyIdToken: mocks.verifyIdToken,
    generateEmailVerificationLink: mocks.generateEmailVerificationLink,
  },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.profileGet, set: mocks.profileSet }),
    }),
  },
}));

vi.mock("@/lib/mailer", () => ({ sendMail: mocks.sendMail }));

import { POST, RESEND_COOLDOWN_SECONDS } from "./route";

const request = (token?: string) =>
  new NextRequest("http://localhost/api/auth/resend-verification", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const profile = (fields?: Record<string, unknown>) => ({
  exists: fields !== undefined,
  get: (key: string) => fields?.[key],
});

beforeEach(() => {
  mocks.verifyIdToken.mockReset().mockResolvedValue({
    uid: "user-1",
    email: "customer@example.com",
    email_verified: false,
  });
  mocks.generateEmailVerificationLink
    .mockReset()
    .mockResolvedValue("https://shipin.example/verify?code=abc");
  mocks.sendMail.mockReset().mockResolvedValue(undefined);
  mocks.profileGet.mockReset().mockResolvedValue(profile({}));
  mocks.profileSet.mockReset().mockResolvedValue(undefined);
  /*
   * The permanent link needs a signing secret from the environment, and this
   * suite must not depend on the developer's shell having one: a machine with
   * MFA_SESSION_SECRET set passed these tests while CI, with neither variable
   * set, saw the Firebase fallback instead. Stubbed here; the fallback test
   * below overrides it with an empty value.
   */
  vi.stubEnv(
    "EMAIL_VERIFICATION_SECRET",
    "test-email-verification-secret-0123456789abcdef"
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/auth/resend-verification", () => {
  it("requires a bearer token", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("rejects a token it cannot verify", async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error("bad token"));

    const response = await POST(request("token"));

    expect(response.status).toBe(401);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("sends to an unverified account instead of refusing it", async () => {
    // The whole point: `requireAuth` would answer 403 here, and this endpoint must
    // not, or the user has no way forward.
    const response = await POST(request("token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.link).toBe("permanent");
    // Our own signed link, not Firebase's: the whole point is that it does not expire,
    // and Firebase's would have to be asked for here.
    expect(mocks.generateEmailVerificationLink).not.toHaveBeenCalled();
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "customer@example.com",
        subject: expect.stringContaining("Verify"),
        text: expect.stringMatching(/\/verify-email\?token=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/),
      })
    );
    expect(mocks.profileSet).toHaveBeenCalledWith(
      { verificationEmailSentAt: expect.anything() },
      { merge: true }
    );
  });

  it("falls back to Firebase's link when no signing secret is configured", async () => {
    vi.stubEnv("EMAIL_VERIFICATION_SECRET", "");
    vi.stubEnv("MFA_SESSION_SECRET", "");

    const response = await POST(request("token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Named in the response and in the mail, because a link that expires is a
    // different promise from the one the rest of this endpoint makes.
    expect(body.link).toBe("expiable");
    expect(mocks.generateEmailVerificationLink).toHaveBeenCalled();
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("https://shipin.example/verify?code=abc"),
      })
    );

    vi.unstubAllEnvs();
  });

  it("refuses an address that is already verified", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      uid: "user-1",
      email: "customer@example.com",
      email_verified: true,
    });

    const response = await POST(request("token"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("ALREADY_VERIFIED");
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("refuses an account with no email address", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      uid: "user-1",
      email: undefined,
      email_verified: false,
    });

    const response = await POST(request("token"));

    expect(response.status).toBe(400);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("enforces the cooldown and says how long to wait", async () => {
    mocks.profileGet.mockResolvedValue(
      profile({ verificationEmailSentAt: Timestamp.fromMillis(Date.now() - 5000) })
    );

    const response = await POST(request("token"));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.code).toBe("RESEND_TOO_SOON");
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(response.headers.get("Retry-After")).toBe(String(body.retryAfter));
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("allows a resend once the cooldown has passed", async () => {
    mocks.profileGet.mockResolvedValue(
      profile({
        verificationEmailSentAt: Timestamp.fromMillis(
          Date.now() - (RESEND_COOLDOWN_SECONDS + 5) * 1000
        ),
      })
    );

    const response = await POST(request("token"));

    expect(response.status).toBe(200);
    expect(mocks.sendMail).toHaveBeenCalled();
  });

  it("does not start the cooldown when the send fails", async () => {
    // Otherwise a delivery failure locks the user out of retrying the fix for it.
    mocks.sendMail.mockRejectedValue(new Error("smtp down"));

    const response = await POST(request("token"));

    // withErrorHandler turns the throw into a 500 rather than letting it escape.
    expect(response.status).toBe(500);
    expect(mocks.profileSet).not.toHaveBeenCalled();
  });
});
