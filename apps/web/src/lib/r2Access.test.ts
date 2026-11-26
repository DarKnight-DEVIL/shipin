/**
 * Ownership rules for `inspection/<requestId>/<file>` keys.
 *
 * The routes used to accept any signed-in account: uploads could be written into
 * another customer's request folder, and a leaked key could be exchanged for a
 * signed URL by anyone with a session.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ collection: vi.fn(), getAll: vi.fn() }));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, getAll: mocks.getAll },
}));

// `isolate: false` shares the module cache between test files, and the
// `r2/view` suite mocks `@/lib/firebaseAdmin` with only `adminAuth`. Importing
// the subject lazily, after a module reset, keeps these tests independent of
// file order: without it this file could receive that mock instead of its own.
let authorizeInspectionAccess: (typeof import("./r2Access"))["authorizeInspectionAccess"];
let authorizeInspectionUpload: (typeof import("./r2Access"))["authorizeInspectionUpload"];
let parseInspectionKey: (typeof import("./r2Access"))["parseInspectionKey"];

const snap = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

/** `requests/{id}` and `users/{uid}` answer with the given documents. */
function firestore(
  requests: Record<string, unknown> | undefined,
  users?: Record<string, unknown>
) {
  mocks.collection.mockImplementation(() => ({ doc: () => ({}) }));
  mocks.getAll.mockResolvedValue([snap(requests), snap(users)]);
}

beforeEach(async () => {
  vi.resetModules();
  mocks.collection.mockReset();
  mocks.getAll.mockReset();
  ({
    authorizeInspectionAccess,
    authorizeInspectionUpload,
    parseInspectionKey,
  } = await import("./r2Access"));
});

describe("parseInspectionKey", () => {
  it("extracts the request id from a well-formed key", () => {
    expect(parseInspectionKey("inspection/req-1/uuid-1.jpg")).toBe("req-1");
  });

  it("rejects keys without a request segment or a file", () => {
    expect(parseInspectionKey("inspection/box.jpg")).toBeNull();
    expect(parseInspectionKey("inspection/req-1/")).toBeNull();
    expect(parseInspectionKey("invoices/req-1/a.pdf")).toBeNull();
    expect(parseInspectionKey("inspection/req-1/nested/a.jpg")).toBeNull();
  });
});

describe("authorizeInspectionAccess", () => {
  it("allows the customer who owns the request", async () => {
    firestore({ userId: "user-1" });

    await expect(
      authorizeInspectionAccess("user-1", "req-1")
    ).resolves.toBeNull();
  });

  it("allows an admin, who works every request", async () => {
    firestore({ userId: "user-1" }, { role: "admin" });

    await expect(
      authorizeInspectionAccess("staff-1", "req-1")
    ).resolves.toBeNull();
  });

  it("allows only admins to upload inspection photos", async () => {
    mocks.collection.mockImplementation(() => ({
      doc: () => ({ get: async () => snap({ role: "customer" }) }),
    }));

    await expect(authorizeInspectionUpload("user-1")).resolves.toMatchObject({
      status: 403,
      code: "ADMIN_ACCESS_REQUIRED",
    });

    mocks.collection.mockImplementation(() => ({
      doc: () => ({ get: async () => snap({ role: "admin" }) }),
    }));

    await expect(authorizeInspectionUpload("staff-1")).resolves.toBeNull();
  });

  it("denies a signed-in stranger", async () => {
    firestore({ userId: "user-1" }, { role: "customer" });

    await expect(authorizeInspectionAccess("user-2", "req-1")).resolves.toEqual(
      {
        status: 404,
        error: "Request not found.",
        code: "REQUEST_NOT_FOUND",
      }
    );
  });

  it("answers the same for a stranger and a missing request, so ids cannot be probed", async () => {
    firestore({ userId: "user-1" }, { role: "customer" });
    const stranger = await authorizeInspectionAccess("user-2", "req-1");

    firestore(undefined, { role: "customer" });
    const missing = await authorizeInspectionAccess("user-2", "req-9");

    expect(stranger).toEqual(missing);
  });

  it("denies a caller with no profile document", async () => {
    firestore({ userId: "user-1" }, undefined);

    await expect(
      authorizeInspectionAccess("ghost", "req-1")
    ).resolves.toMatchObject({
      status: 404,
    });
  });

  it("rejects an empty request id", async () => {
    await expect(
      authorizeInspectionAccess("user-1", "")
    ).resolves.toMatchObject({
      status: 400,
      code: "INVALID_REQUEST_BODY",
    });
    expect(mocks.collection).not.toHaveBeenCalled();
  });
});
