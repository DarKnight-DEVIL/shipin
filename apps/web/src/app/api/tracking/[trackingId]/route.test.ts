/**
 * Tests for the public tracking route.
 *
 * The route is a thin shell over `resolveTracking`; the caching, carrier and
 * termination behaviour lives in trackingSync.test.ts. What belongs here is the
 * public access check: a modern random id is its own secret, while a legacy
 * sequential id is served only with a valid signed token, and an unauthorised
 * lookup is indistinguishable from an unknown one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ resolveTracking: vi.fn() }));

vi.mock("@/features/shipments/services/trackingSync", () => ({
  resolveTracking: mocks.resolveTracking,
}));

import { CarrierRequestError } from "@/features/shipments/carriers";
import { createTrackingToken } from "@/lib/trackingToken";
import { GET } from "./route";

const MODERN = "SHP-7Q2M4X8B1N6R3T5V";
const LEGACY = "SHP-2026-000001";
const SECRET = "tracking-token-secret-0123456789";

const context = (trackingId: string) => ({ params: { trackingId } });

const shipment = {
  trackingId: MODERN,
  status: "shipped",
  carrier: "India Post",
  estimatedDelivery: "2026-06-08",
  createdAt: "2026-05-01T00:00:00.000Z",
  statusHistory: {
    shipped: "2026-05-02T00:00:00.000Z",
    out_for_delivery: null,
    delivered: null,
  },
  events: [
    {
      code: "IN_TRANSIT",
      description: "In transit",
      occurredAt: "2026-05-03T00:00:00.000Z",
    },
  ],
  carrierStatus: "in_transit",
  lastSyncedAt: "2026-05-03T00:00:00.000Z",
  syncPaused: false,
  syncPauseReason: null,
  source: "placeholder" as const,
};

beforeEach(() => {
  vi.stubEnv("TRACKING_TOKEN_SECRET", SECRET);
  mocks.resolveTracking.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/tracking/:trackingId", () => {
  it("requires a tracking id", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/tracking/"),
      context("")
    );

    expect(response.status).toBe(400);
    expect(mocks.resolveTracking).not.toHaveBeenCalled();
  });

  it("404s for an unknown tracking id", async () => {
    mocks.resolveTracking.mockResolvedValue(null);

    const response = await GET(
      new NextRequest(`http://localhost/api/tracking/${MODERN}`),
      context(MODERN)
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: "Shipment not found.",
      code: "NOT_FOUND",
    });
  });

  it("refuses a legacy sequential id without a token", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/tracking/${LEGACY}`),
      context(LEGACY)
    );

    // Same answer as an unknown id: the endpoint must not confirm that a
    // legacy id exists.
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "NOT_FOUND",
      error: "Shipment not found.",
    });
    expect(mocks.resolveTracking).not.toHaveBeenCalled();
  });

  it("serves a legacy id with a valid signed token", async () => {
    const token = createTrackingToken(LEGACY)!;
    mocks.resolveTracking.mockResolvedValue({ ...shipment, trackingId: LEGACY });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/tracking/${LEGACY}?token=${encodeURIComponent(
          token
        )}`
      ),
      context(LEGACY)
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveTracking).toHaveBeenCalledWith(LEGACY);
  });

  it("refuses a tampered token instead of falling back to the id", async () => {
    const token = createTrackingToken(LEGACY)!;
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    const response = await GET(
      new NextRequest(
        `http://localhost/api/tracking/${LEGACY}?token=${encodeURIComponent(
          tampered
        )}`
      ),
      context(LEGACY)
    );

    expect(response.status).toBe(404);
    expect(mocks.resolveTracking).not.toHaveBeenCalled();
  });

  it("returns the sanitised shipment view", async () => {
    mocks.resolveTracking.mockResolvedValue(shipment);

    const response = await GET(
      new NextRequest(`http://localhost/api/tracking/${MODERN}`),
      context(MODERN)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.shipment).toEqual(shipment);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("does not expose the carrier consignment number", async () => {
    mocks.resolveTracking.mockResolvedValue(shipment);

    const response = await GET(
      new NextRequest(`http://localhost/api/tracking/${MODERN}`),
      context(MODERN)
    );

    expect(JSON.stringify(await response.json())).not.toContain(
      "EE123456789IN"
    );
  });

  it("reports a carrier failure as 502", async () => {
    mocks.resolveTracking.mockRejectedValue(
      new CarrierRequestError("India Post", "down", 503)
    );

    const response = await GET(
      new NextRequest(`http://localhost/api/tracking/${MODERN}`),
      context(MODERN)
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe("TRACKING_UPSTREAM_ERROR");
  });
});
