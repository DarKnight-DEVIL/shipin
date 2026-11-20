// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getR2Client: vi.fn(),
  getR2BucketName: vi.fn(() => "shipin-bucket"),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectsCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("./r2", () => ({
  getR2Client: mocks.getR2Client,
  getR2BucketName: mocks.getR2BucketName,
}));

import { deleteR2Objects } from "./r2Delete";

beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ Errors: [] });
  mocks.getR2Client.mockReset().mockReturnValue({ send: mocks.send });
});

describe("deleteR2Objects", () => {
  it("does not call the API for an empty list", async () => {
    await expect(deleteR2Objects([])).resolves.toEqual({ deleted: 0, failed: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("dedupes keys and ignores blanks", async () => {
    const outcome = await deleteR2Objects([
      "a.jpg",
      "a.jpg",
      "",
      "  ",
      "b.jpg",
    ]);

    expect(outcome).toEqual({ deleted: 2, failed: 0 });
    const command = mocks.send.mock.calls[0][0] as {
      input: { Bucket: string; Delete: { Objects: { Key: string }[] } };
    };
    expect(command.input.Bucket).toBe("shipin-bucket");
    expect(command.input.Delete.Objects).toEqual([
      { Key: "a.jpg" },
      { Key: "b.jpg" },
    ]);
  });

  it("chunks above the 1000-key API limit", async () => {
    const keys = Array.from({ length: 1001 }, (_, index) => `k-${index}.jpg`);

    await deleteR2Objects(keys);

    expect(mocks.send).toHaveBeenCalledTimes(2);
    const sizes = mocks.send.mock.calls.map(
      (call) =>
        (call[0] as { input: { Delete: { Objects: unknown[] } } }).input.Delete
          .Objects.length
    );
    expect(sizes).toEqual([1000, 1]);
  });

  it("counts per-key failures instead of reporting success", async () => {
    mocks.send.mockResolvedValue({
      Errors: [{ Key: "b.jpg", Code: "AccessDenied" }],
    });

    await expect(deleteR2Objects(["a.jpg", "b.jpg"])).resolves.toEqual({
      deleted: 1,
      failed: 1,
    });
  });
});
