import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  getDocuments: vi.fn(),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            update: mocks.update,
            delete: mocks.remove,
            parent: { get: mocks.getDocuments },
          })),
        })),
      })),
    })),
    batch: vi.fn(() => ({
      update: mocks.batchUpdate,
      commit: mocks.batchCommit,
    })),
  },
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ addressId: "addr-1" }) };

const request = (body?: unknown, method = "PATCH") =>
  new NextRequest("http://localhost/api/addresses/addr-1", {
    method,
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: "user-1" } });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.getDocuments.mockReset().mockResolvedValue({ docs: [] });
  mocks.batchUpdate.mockReset();
  mocks.batchCommit.mockReset().mockResolvedValue(undefined);
});

describe("PATCH /api/addresses/[addressId]", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await PATCH(request({ city: "Paris" }), context);

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body", async () => {
    const response = await PATCH(request("{nope"), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an empty update", async () => {
    const response = await PATCH(request({}), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid field value", async () => {
    const response = await PATCH(request({ city: "" }), context);

    expect(response.status).toBe(400);
  });

  it("applies the change", async () => {
    const response = await PATCH(request({ city: "Paris" }), context);

    expect(mocks.batchUpdate.mock.calls[0][1]).toEqual({
      city: "Paris",
      updatedAt: "__SERVER_TS__",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("clears the previous default in the same batch", async () => {
    mocks.getDocuments.mockResolvedValue({
      docs: [
        { id: "addr-1", ref: "ref-1" },
        { id: "addr-2", ref: "ref-2" },
      ],
    });

    const response = await PATCH(
      request({ city: "Paris", isDefault: true }),
      context
    );

    expect(mocks.batchUpdate).toHaveBeenCalledWith("ref-1", {
      city: "Paris",
      isDefault: true,
      updatedAt: "__SERVER_TS__",
    });
    expect(mocks.batchUpdate).toHaveBeenCalledWith("ref-2", {
      isDefault: false,
      updatedAt: "__SERVER_TS__",
    });
    expect(mocks.batchCommit).toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("404s when promoting an address that is not in the book", async () => {
    mocks.getDocuments.mockResolvedValue({
      docs: [{ id: "other", ref: "ref-other" }],
    });

    const response = await PATCH(request({ isDefault: true }), context);

    expect(response.status).toBe(404);
    expect(mocks.batchCommit).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/addresses/[addressId]", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await DELETE(request(undefined, "DELETE"), context);

    expect(response.status).toBe(401);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("removes the address", async () => {
    const response = await DELETE(request(undefined, "DELETE"), context);

    expect(mocks.remove).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
