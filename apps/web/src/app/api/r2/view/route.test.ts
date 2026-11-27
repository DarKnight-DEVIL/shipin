import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthAccount: vi.fn(),
  getSignedUrl: vi.fn(),
  getR2Client: vi.fn(),
  getR2BucketName: vi.fn(),
  command: vi.fn(),
  authorize: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class {
    constructor(input: unknown) {
      mocks.command(input);
      this.input = input;
    }
    input: unknown;
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));
vi.mock("@/lib/r2", () => ({
  getR2Client: mocks.getR2Client,
  getR2BucketName: mocks.getR2BucketName,
}));

// The shared gate (App Check, token, verified email, account block) is covered
// in lib/auth's own tests; here only the wiring matters.
vi.mock("@/lib/auth", () => ({
  requireAuthAccount: mocks.requireAuthAccount,
}));

// The ownership rules themselves live in lib/r2Access.test.ts; here only the
// wiring matters, so the decision is stubbed and the key parser stays real.
vi.mock("@/lib/r2Access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/r2Access")>();
  return { ...actual, authorizeInspectionAccess: mocks.authorize };
});

import { POST } from "./route";
import { NextResponse } from "next/server";

const request = (options: { token?: string; body?: unknown } = {}) =>
  new NextRequest("http://localhost/api/r2/view", {
    method: "POST",
    headers:
      options.token === undefined
        ? {}
        : { authorization: `Bearer ${options.token}` },
    body: JSON.stringify(options.body ?? { key: "inspection/req-1/box.jpg" }),
  });

beforeEach(() => {
  mocks.requireAuthAccount
    .mockReset()
    .mockResolvedValue({ token: { uid: "user-1" }, profile: null });
  mocks.getSignedUrl.mockReset().mockResolvedValue("https://r2.example/signed");
  mocks.getR2Client.mockReset().mockReturnValue({ client: true });
  mocks.getR2BucketName.mockReset().mockReturnValue("shipin-bucket");
  mocks.command.mockReset();
  mocks.authorize.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/r2/view", () => {
  it("requires a bearer token", async () => {
    mocks.requireAuthAccount.mockResolvedValue(
      NextResponse.json(
        { success: false, error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" },
        { status: 401 }
      )
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", async () => {
    mocks.requireAuthAccount.mockResolvedValue(
      NextResponse.json(
        { success: false, error: "Invalid authentication token.", code: "INVALID_AUTHENTICATION" },
        { status: 401 }
      )
    );

    const response = await POST(request({ token: "bad" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_AUTHENTICATION",
    });
  });

  it("refuses a banned or unverified account, and does not cache the refusal", async () => {
    // The gate's account-state denial must pass through with the route's
    // no-store discipline: a valid-but-stale token used to keep serving a
    // banned customer's inspection photos for up to an hour.
    mocks.requireAuthAccount.mockResolvedValue(
      NextResponse.json(
        {
          success: false,
          error: "This account has been banned.",
          code: "ACCOUNT_BANNED",
        },
        { status: 403 }
      )
    );

    const response = await POST(request({ token: "good" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACCOUNT_BANNED",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("requires an object key", async () => {
    const response = await POST(request({ token: "good", body: {} }));

    expect(response.status).toBe(400);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects keys outside the inspection directory", async () => {
    const response = await POST(
      request({ token: "good", body: { key: "invoices/secret.pdf" } })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid inspection photo path.",
    });
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("refuses a key whose request belongs to somebody else", async () => {
    mocks.authorize.mockResolvedValue({
      status: 404,
      error: "Request not found.",
      code: "REQUEST_NOT_FOUND",
    });

    const response = await POST(request({ token: "good" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "REQUEST_NOT_FOUND",
    });
    // No signed URL may be minted for a denied key.
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a key without a request segment", async () => {
    const response = await POST(
      request({ token: "good", body: { key: "inspection/box.jpg" } })
    );

    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("signs an inspection photo for the review window, not 15 minutes", async () => {
    const response = await POST(request({ token: "good" }));

    // The key's request id is what authorization is keyed on.
    expect(mocks.authorize).toHaveBeenCalledWith("user-1", "req-1");
    expect(mocks.command).toHaveBeenCalledWith({
      Bucket: "shipin-bucket",
      Key: "inspection/req-1/box.jpg",
    });
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      { client: true },
      expect.anything(),
      {
        // 60 minutes: a warehouse reviewer works through a gallery, and 15 minutes
        // could expire under them. See `r2UrlPolicy`.
        expiresIn: 3600,
      }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      url: "https://r2.example/signed",
    });
  });

  it("takes the lifetime from the environment for this purpose", async () => {
    vi.stubEnv("R2_INSPECTION_URL_TTL_SECONDS", "7200");

    await POST(request({ token: "good" }));

    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      { client: true },
      expect.anything(),
      { expiresIn: 7200 }
    );
  });

  it("refuses a label key, which nothing serves yet", async () => {
    // `purposeForKey` knows the shipping-label purpose so the TTL knob exists, but no
    // authorizer covers that prefix: accepting it would let any signed-in user read
    // any key under `labels/`.
    const response = await POST(request({ token: "good", body: { key: "labels/req-1/x.pdf" } }));

    expect(response.status).toBe(400);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });
});
