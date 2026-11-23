import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  send: vi.fn(),
  getR2Client: vi.fn(),
  getR2BucketName: vi.fn(),
  command: vi.fn(),
  authorize: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken },
  adminDb: {},
}));
// Ownership rules are covered in lib/r2Access.test.ts; this file asserts the
// route consults them before writing anything.
vi.mock("@/lib/r2Access", () => ({
  authorizeInspectionAccess: mocks.authorize,
  parseInspectionKey: () => "req-1",
}));
vi.mock("@/lib/r2", () => ({
  getR2Client: mocks.getR2Client,
  getR2BucketName: mocks.getR2BucketName,
}));
vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      mocks.command(input);
      this.input = input;
    }
  },
}));

import { POST } from "./route";

function uploadRequest(
  options: {
    token?: string;
    file?: File | null;
    requestId?: string | null;
  } = {}
) {
  const form = new FormData();

  if (options.file !== null) {
    form.append(
      "file",
      options.file ??
        new File([new Uint8Array([1, 2, 3])], "box.jpg", { type: "image/jpeg" })
    );
  }
  if (options.requestId !== null) {
    form.append("requestId", options.requestId ?? "req-1");
  }

  return new Request("http://localhost/api/r2/upload", {
    method: "POST",
    headers:
      options.token === undefined
        ? {}
        : { authorization: `Bearer ${options.token}` },
    body: form,
  });
}

beforeEach(() => {
  mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: "admin-1" });
  mocks.send.mockReset().mockResolvedValue({});
  mocks.getR2Client.mockReset().mockReturnValue({ send: mocks.send });
  mocks.getR2BucketName.mockReset().mockReturnValue("shipin-bucket");
  mocks.command.mockReset();
  mocks.authorize.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/r2/upload", () => {
  it("requires a bearer token", async () => {
    const response = await POST(uploadRequest());

    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error("expired"));

    const response = await POST(uploadRequest({ token: "bad" }));

    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("requires a file", async () => {
    const response = await POST(uploadRequest({ token: "good", file: null }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "No image file provided.",
    });
  });

  it("requires a request id", async () => {
    const response = await POST(
      uploadRequest({ token: "good", requestId: null })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Request ID is required.",
    });
  });

  it("rejects unsupported file types", async () => {
    const file = new File(["pdf"], "label.pdf", { type: "application/pdf" });

    const response = await POST(uploadRequest({ token: "good", file }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Only JPG, PNG and WebP images are allowed.",
    });
  });

  it("rejects files larger than 10 MB", async () => {
    /* FormData copies the file, so a size override has to skip it entirely. */
    const oversized = new File([new Uint8Array([1])], "big.png", {
      type: "image/png",
    });
    Object.defineProperty(oversized, "size", { value: 10 * 1024 * 1024 + 1 });
    const request = {
      headers: new Headers({ authorization: "Bearer good" }),
      formData: async () => ({
        get: (key: string) => (key === "file" ? oversized : "req-1"),
      }),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Image must be 10 MB or smaller.",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ])("stores %s under the inspection directory", async (type, extension) => {
    const file = new File([new Uint8Array([1])], `photo.${extension}`, {
      type,
    });

    const response = await POST(
      uploadRequest({ token: "good", file, requestId: "req/1!" })
    );
    const body = await response.json();

    // The route takes the id from `node:crypto`, so the contract is the shape
    // (a real UUID under the sanitised request directory), not a fixed value.
    const keyPattern = new RegExp(
      `^inspection/req1/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${extension}$`
    );

    expect(body.key).toMatch(keyPattern);
    expect(mocks.command).toHaveBeenCalledWith({
      Bucket: "shipin-bucket",
      Key: expect.stringMatching(keyPattern),
      Body: expect.any(Buffer),
      ContentType: type,
      Metadata: { requestid: "req1" },
    });
    expect(mocks.send).toHaveBeenCalled();
    expect(body.success).toBe(true);
  });

  it("checks ownership of the target request before uploading", async () => {
    const file = new File([new Uint8Array([1])], "photo.jpg", {
      type: "image/jpeg",
    });

    await POST(uploadRequest({ token: "good", file, requestId: "req/1!" }));

    // The sanitised id is what the object key uses, so it is what must be
    // authorized.
    expect(mocks.authorize).toHaveBeenCalledWith("admin-1", "req1");
  });

  it("refuses to upload into a request the caller does not own", async () => {
    mocks.authorize.mockResolvedValue({
      status: 404,
      error: "Request not found.",
      code: "REQUEST_NOT_FOUND",
    });

    const response = await POST(uploadRequest({ token: "good" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "REQUEST_NOT_FOUND",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("reports an upload failure without leaking details", async () => {
    mocks.send.mockRejectedValue(new Error("r2 down"));

    const response = await POST(uploadRequest({ token: "good" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unable to upload image.",
    });
    expect(console.error).toHaveBeenCalledWith(
      "R2 upload error:",
      expect.any(Error)
    );
  });
});
