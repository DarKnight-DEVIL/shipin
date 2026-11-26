// @vitest-environment happy-dom

/**
 * The two client calls that reach the verification endpoints.
 *
 * Both of them are the only way an unverified customer can get unstuck, and both turn a
 * server answer into something the screen can render. What they must never do is resolve
 * as success when the server refused, or throw where the caller expects a result.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestVerificationResend, verifyEmailLink } from "./emailVerification";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A Response stand-in; the helpers only read `ok` and `json()`. */
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("requestVerificationResend", () => {
  it("reports a send as sent", async () => {
    fetchMock.mockResolvedValue(reply(200, { success: true }));

    await expect(requestVerificationResend("id-token")).resolves.toEqual({
      status: "sent",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/resend-verification",
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer id-token" },
      })
    );
  });

  it("reports an address verified elsewhere as done, not as an error", async () => {
    fetchMock.mockResolvedValue(
      reply(409, { code: "ALREADY_VERIFIED", error: "Already verified." })
    );

    await expect(requestVerificationResend("token")).resolves.toEqual({
      status: "already-verified",
    });
  });

  it("carries the server's wait into a cooldown", async () => {
    fetchMock.mockResolvedValue(
      reply(429, {
        code: "RESEND_TOO_SOON",
        error: "Wait 42s before requesting another email.",
        retryAfter: 42,
      })
    );

    await expect(requestVerificationResend("token")).resolves.toMatchObject({
      status: "too-soon",
      retryAfter: 42,
    });
  });

  it("defaults the cooldown when the server does not say how long", async () => {
    fetchMock.mockResolvedValue(reply(429, { code: "RESEND_TOO_SOON" }));

    const result = await requestVerificationResend("token");

    // A missing `retryAfter` must not leave the button enabled with no explanation.
    expect(result).toMatchObject({ status: "too-soon", retryAfter: 60 });
    expect(result.status === "too-soon" && result.message).toMatch(/wait/i);
  });

  it("surfaces a refusal with the server's own wording", async () => {
    fetchMock.mockResolvedValue(
      reply(400, { error: "This account has no email address to verify." })
    );

    await expect(requestVerificationResend("token")).resolves.toEqual({
      status: "failed",
      message: "This account has no email address to verify.",
    });
  });

  it("has something to say when the body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(requestVerificationResend("token")).resolves.toEqual({
      status: "failed",
      message: "The verification email could not be sent.",
    });
  });

  it("does not throw when the network fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(requestVerificationResend("token")).resolves.toMatchObject({
      status: "failed",
      message: expect.stringMatching(/check your connection/i),
    });
  });
});

describe("verifyEmailLink", () => {
  it("posts the token and reports the account verified", async () => {
    fetchMock.mockResolvedValue(reply(200, { success: true }));

    await expect(verifyEmailLink("uid.signature")).resolves.toEqual({
      status: "verified",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify-email-link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "uid.signature" }),
      })
    );
  });

  it("treats a repeat click as success", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { success: true, alreadyVerified: true })
    );

    await expect(verifyEmailLink("uid.signature")).resolves.toEqual({
      status: "already-verified",
    });
  });

  it("shows the server's reason for a spent link", async () => {
    fetchMock.mockResolvedValue(
      reply(400, {
        code: "INVALID_OR_USED_TOKEN",
        error:
          "This verification link has already been used or is no longer valid. Ask for a new one.",
      })
    );

    await expect(verifyEmailLink("uid.spent")).resolves.toEqual({
      status: "failed",
      message:
        "This verification link has already been used or is no longer valid. Ask for a new one.",
    });
  });

  it("does not report success when the body says otherwise", async () => {
    // A 200 with `success: false` is still a refusal; trusting the status alone would
    // show a verified screen over an account that is not verified.
    fetchMock.mockResolvedValue(reply(200, { success: false, error: "Nope." }));

    await expect(verifyEmailLink("uid.x")).resolves.toEqual({
      status: "failed",
      message: "Nope.",
    });
  });

  it("falls back to its own wording when the server explains nothing", async () => {
    fetchMock.mockResolvedValue(reply(500, {}));

    await expect(verifyEmailLink("uid.x")).resolves.toEqual({
      status: "failed",
      message: "This verification link could not be used. Ask for a new one.",
    });
  });

  it("does not throw when the network fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(verifyEmailLink("uid.x")).resolves.toMatchObject({
      status: "failed",
      message: expect.stringMatching(/check your connection/i),
    });
  });
});
