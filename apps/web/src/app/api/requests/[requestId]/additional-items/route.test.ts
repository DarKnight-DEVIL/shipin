import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.get, update: mocks.update }),
    }),
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));

import { POST } from "./route";

const context = (requestId = "req-1") => ({
  params: Promise.resolve({ requestId }),
});

const post = (
  body: unknown = { name: "Cable", url: "https://shop/cable", quantity: 2 }
) =>
  new NextRequest("http://localhost/api/requests/req-1/additional-items", {
    method: "POST",
    body: JSON.stringify(body),
  });

const respondWith = (data: Record<string, unknown> | undefined) =>
  mocks.get.mockResolvedValue({ exists: data !== undefined, data: () => data });

const owned = (overrides: Record<string, unknown> = {}) => ({
  userId: "user-1",
  status: "paid",
  additionalItemRequests: [],
  ...overrides,
});

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: "user-1" },
    profile: { uid: "user-1", role: "customer" },
  });
  mocks.update.mockReset().mockResolvedValue(undefined);
  respondWith(owned());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/requests/[requestId]/additional-items", () => {
  it("returns the auth response when unauthenticated", async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );

    const response = await POST(post(), context());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("appends a pending item in the shape the admin panel reads", async () => {
    const response = await POST(post(), context());

    expect(response.status).toBe(201);

    const update = mocks.update.mock.calls[0][0];
    expect(update.additionalItemRequests).toHaveLength(1);

    const item = update.additionalItemRequests[0];
    expect(item).toMatchObject({
      item: { name: "Cable", url: "https://shop/cable", quantity: 2 },
      status: "pending",
      orderChangeHold: true,
      requestedAt: "__SERVER_TS__",
    });
    expect(typeof item.id).toBe("string");

    expect(update.orderChange).toEqual({
      active: true,
      requiresRepacking: false,
      repackingFee: 0,
      storageFee: 0,
      storageFeeApplied: false,
      startedAt: "__SERVER_TS__",
    });
    expect(update.updatedAt).toBe("__SERVER_TS__");

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      itemId: item.id,
    });
  });

  it("charges repacking when the order is already packed", async () => {
    respondWith(owned({ status: "packed" }));

    await POST(post(), context());

    const update = mocks.update.mock.calls[0][0];
    expect(update.orderChange).toMatchObject({
      requiresRepacking: true,
      repackingFee: 2,
    });
  });

  it("leaves an in-flight order change alone", async () => {
    respondWith(
      owned({
        orderChange: {
          active: true,
          requiresRepacking: true,
          repackingFee: 2,
          storageFee: 5,
          storageFeeApplied: true,
        },
      })
    );

    await POST(post(), context());

    const update = mocks.update.mock.calls[0][0];
    expect(update.orderChange).toBeUndefined();
  });

  it("answers 404 for a missing request", async () => {
    respondWith(undefined);

    const response = await POST(post(), context());

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("answers 404 for another customer's request", async () => {
    respondWith(owned({ userId: "user-2" }));

    const response = await POST(post(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Request not found.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a request that is already dispatched", async () => {
    respondWith(owned({ status: "shipped" }));

    const response = await POST(post(), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "Additional items can only be requested before the shipment has been dispatched.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a request that already carries 100 items", async () => {
    respondWith(
      owned({
        additionalItemRequests: Array.from({ length: 100 }, () => ({
          id: "x",
        })),
      })
    );

    const response = await POST(post(), context());

    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a malformed item", async () => {
    const response = await POST(
      post({ name: "", url: "not-a-url", quantity: 0 }),
      context()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST_BODY",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/requests/req-1/additional-items", {
        method: "POST",
        body: "{nope",
      }),
      context()
    );

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
