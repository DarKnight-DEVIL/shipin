// @vitest-environment happy-dom

/**
 * The customer tracking page.
 *
 * The tracking service now returns a `notice` for the states it cannot explain with
 * scans - in particular a parcel that has no consignment number yet, where polling
 * pauses and the history is empty. That notice is the only thing telling the customer
 * why nothing is happening, so it is pinned here rather than trusted to survive the
 * next refactor of the page.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ trackingId: "SHIPIN-123" }),
  useRouter: () => ({ push: h.push }),
}));

import TrackingShell from "./TrackingShell";

const shipment = (overrides: Record<string, unknown> = {}) => ({
  trackingId: "SHIPIN-123",
  status: "shipped",
  carrier: "India Post",
  estimatedDelivery: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  statusHistory: { shipped: "2026-01-01T00:00:00.000Z" },
  events: [],
  source: "cache",
  ...overrides,
});

function respondWith(shipmentBody: unknown) {
  h.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, shipment: shipmentBody }),
  });
}

beforeEach(() => {
  h.fetch.mockReset();
  h.push.mockReset();
  vi.stubGlobal("fetch", h.fetch);
});

describe("TrackingShell: what the customer is told", () => {
  it("shows the notice when the carrier has no consignment number yet", async () => {
    respondWith(
      shipment({
        syncPaused: true,
        syncPauseReason: "no_carrier_number",
        notice: "Carrier tracking will appear once the parcel is handed over.",
      })
    );

    render(<TrackingShell />);

    expect(
      await screen.findByText(
        "Carrier tracking will appear once the parcel is handed over."
      )
    ).toBeTruthy();

    // No scans is the honest state: the empty "Carrier Updates" block is not rendered at
    // all, rather than shown as a blank card.
    expect(screen.queryByText("Carrier Updates")).toBeNull();
  });

  it("stays quiet when the shipment has nothing to explain", async () => {
    respondWith(
      shipment({
        events: [
          {
            code: "IN_TRANSIT",
            description: "Item bagged at Mumbai",
            occurredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      })
    );

    render(<TrackingShell />);

    await waitFor(() =>
      expect(screen.getByText("Item bagged at Mumbai")).toBeTruthy()
    );
    expect(screen.queryByText(/temporarily unavailable/i)).toBeNull();
    expect(screen.queryByText(/handed over/i)).toBeNull();
  });

  it("shows the same notice when the live feed is unavailable", async () => {
    // The other state the sync explains rather than hides.
    respondWith(
      shipment({
        events: [
          {
            code: "IN_TRANSIT",
            description: "Item bagged at Mumbai",
            occurredAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        notice:
          "Live updates are temporarily unavailable. Showing the last known status.",
      })
    );

    render(<TrackingShell />);

    expect(
      await screen.findByText(
        "Live updates are temporarily unavailable. Showing the last known status."
      )
    ).toBeTruthy();
    // The last known history stays on screen rather than being replaced by the notice.
    expect(screen.getByText("Item bagged at Mumbai")).toBeTruthy();
  });
});
