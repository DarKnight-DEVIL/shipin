import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { runTransaction: mocks.runTransaction },
}));

import {
  CAPTURE_CLAIM_LEASE_MS,
  claimCapture,
  releaseCaptureClaim,
} from "./captureClaim";

const ref = { id: "order-1" } as never;

const orderWith = (data: Record<string, unknown>) => ({
  exists: true,
  data: () => data,
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.update.mockReset();
  mocks.runTransaction
    .mockReset()
    .mockImplementation(async (callback: (transaction: unknown) => unknown) =>
      callback({ get: mocks.get, update: mocks.update })
    );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("claimCapture", () => {
  it("claims a created order and stamps the lease", async () => {
    mocks.get.mockResolvedValue(orderWith({ status: "created" }));

    await expect(claimCapture(ref)).resolves.toBe("claimed");
    expect(mocks.update).toHaveBeenCalledWith(ref, {
      status: "capturing",
      captureClaimedAt: expect.any(Number),
    });
  });

  it("reports an already completed order without rewriting it", async () => {
    mocks.get.mockResolvedValue(orderWith({ status: "completed" }));

    await expect(claimCapture(ref)).resolves.toBe("completed");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports a live claim as busy", async () => {
    mocks.get.mockResolvedValue(
      orderWith({ status: "capturing", captureClaimedAt: Date.now() })
    );

    await expect(claimCapture(ref)).resolves.toBe("busy");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("takes over a claim whose lease expired", async () => {
    mocks.get.mockResolvedValue(
      orderWith({
        status: "capturing",
        captureClaimedAt: Date.now() - CAPTURE_CLAIM_LEASE_MS - 1,
      })
    );

    await expect(claimCapture(ref)).resolves.toBe("claimed");
    expect(mocks.update).toHaveBeenCalled();
  });

  it("takes over a capturing order that never recorded a claim time", async () => {
    mocks.get.mockResolvedValue(orderWith({ status: "capturing" }));

    await expect(claimCapture(ref)).resolves.toBe("claimed");
  });

  it("claims an order with no data at all", async () => {
    mocks.get.mockResolvedValue({ exists: false, data: () => undefined });

    await expect(claimCapture(ref)).resolves.toBe("claimed");
  });
});

describe("releaseCaptureClaim", () => {
  it("returns a held claim to created", async () => {
    mocks.get.mockResolvedValue(orderWith({ status: "capturing" }));

    await releaseCaptureClaim(ref);

    expect(mocks.update).toHaveBeenCalledWith(ref, {
      status: "created",
      captureClaimedAt: null,
    });
  });

  it("leaves a settled order alone", async () => {
    mocks.get.mockResolvedValue(orderWith({ status: "completed" }));

    await releaseCaptureClaim(ref);

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("swallows a Firestore failure and logs it", async () => {
    const error = new Error("offline");
    mocks.runTransaction.mockRejectedValue(error);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(releaseCaptureClaim(ref)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Could not release the PayPal capture claim:",
      error
    );
  });
});
