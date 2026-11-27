import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mocks.get, update: mocks.update })),
    })),
  },
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));
vi.mock("@/features/notifications/services/notificationService", () => ({
  sendNotification: mocks.sendNotification,
}));

import { createPublicTrackingUrl } from "@/lib/trackingToken";
import { POST } from "./route";

const body = {
  internalTrackingId: "SHP-2026-000001",
  carrier: "DHL",
  trackingNumber: "  ABC123  ",
};

const call = (payload: unknown = body) =>
  POST({ json: async () => payload } as Request, {
    params: Promise.resolve({ requestId: "req-1" }),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: "admin-1" });
  mocks.getAdminAuthError
    .mockReset()
    .mockReturnValue({ error: "Unauthorized", status: 401 });
  mocks.get
    .mockReset()
    .mockResolvedValue({ exists: true, data: () => ({ status: "packed" }) });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.sendNotification.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("TRACKING_TOKEN_SECRET", "test-tracking-secret-0123456789");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/admin/requests/[requestId]/shipment", () => {
  it("returns the admin auth error unchanged", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("no token"));

    const response = await call();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires the tracking fields", async () => {
    const response = await call({ carrier: "DHL" });

    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("404s for an unknown request", async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await call();

    expect(response.status).toBe(404);
  });

  it("fails when the request has no data", async () => {
    mocks.get.mockResolvedValue({ exists: true, data: () => undefined });

    const response = await call();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "An unexpected error occurred.",
      code: "INTERNAL_ERROR",
    });
  });

  it("stores trimmed tracking details", async () => {
    const createdAt = { seconds: 1780272000, nanoseconds: 0 };
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ status: "paid" }),
    });

    const response = await call({
      ...body,
      estimatedDelivery: "2026-06-10T00:00:00.000Z",
      trackingUrl: "https://dhl.example/track",
      createdAt,
    });

    expect(mocks.update).toHaveBeenCalledWith({
      tracking: {
        internalTrackingId: "SHP-2026-000001",
        carrier: "DHL",
        trackingNumber: "ABC123",
        estimatedDelivery: "2026-06-10T00:00:00.000Z",
        trackingUrl: "https://dhl.example/track",
        createdAt,
      },
      updatedAt: "__SERVER_TS__",
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      trackingId: "SHP-2026-000001",
      publicTrackingUrl: createPublicTrackingUrl("SHP-2026-000001"),
    });
  });

  it("mints an unguessable tracking ID when the request does not supply one", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ status: "paid" }),
    });

    const response = await call({ carrier: "DHL", trackingNumber: "ABC123" });

    // Crockford base32, 16 random characters: a sequential id would let one
    // label reveal every shipment minted around it.
    const minted = /^SHP-[0-9A-HJKMNP-TV-Z]{16}$/;
    expect(mocks.update.mock.calls[0][0].tracking.internalTrackingId).toMatch(
      minted
    );
    const body = await response.json();
    expect(body.trackingId).toMatch(minted);
    expect(body.trackingId).not.toBe("SHP-2026-000001");
    expect(body.publicTrackingUrl).toBe(
      createPublicTrackingUrl(body.trackingId)
    );
  });

  it("defaults optional tracking fields", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ status: "paid" }),
    });

    await call();

    expect(mocks.update.mock.calls[0][0].tracking).toMatchObject({
      estimatedDelivery: null,
      trackingUrl: "",
      createdAt: "__SERVER_TS__",
    });
  });

  it("notifies the customer when a packed order ships", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ status: "packed", userId: "user-1", customerName: "Ada" }),
    });

    await call();

    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        requestId: "req-1",
        // The notification carries a signed public tracking link, so a legacy
        // id can still be opened after bare sequential lookups are refused.
        message: expect.stringContaining(
          createPublicTrackingUrl("SHP-2026-000001")!
        ),
        category: "shipment",
        channels: { inApp: true, email: true, whatsapp: true },
        whatsapp: expect.objectContaining({
          templateName: "shipin_package_shipped",
        }),
      })
    );
  });

  it("does not notify for a request that is not packed", async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ status: "paid" }),
    });

    await call();

    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("saves the tracking even if the notification fails", async () => {
    mocks.sendNotification.mockRejectedValue(new Error("mail down"));

    const response = await call();

    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      "Shipment notification failed:",
      expect.any(Error)
    );
  });

  it("reports a write failure", async () => {
    mocks.update.mockRejectedValue(new Error("offline"));

    const response = await call();

    // The provider's message stays in the server log; the client gets the
    // generic internal-failure text.
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "An unexpected error occurred.",
      code: "INTERNAL_ERROR",
    });
  });
});
