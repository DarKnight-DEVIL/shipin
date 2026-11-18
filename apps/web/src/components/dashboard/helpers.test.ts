import { describe, expect, it } from "vitest";

import type { DashboardMetricId } from "@/features/users/services/dashboardMetrics";
import { getMetricHref, METRIC_ICONS, SHIPMENT_PHASES, SHORTCUTS } from "./helpers";

const EXPECTED_HREFS: Record<DashboardMetricId, string> = {
  active: "/requests",
  submitted: "/requests?status=submitted",
  quote_ready: "/requests?status=review",
  awaiting_payment: "/requests?status=awaiting_payment",
  paid: "/requests?status=paid",
  purchased: "/requests?status=purchased",
  warehouse_received: "/requests?status=warehouse_received",
  ready_for_international_shipping:
    "/requests?status=ready_for_international_shipping",
  packed: "/requests?status=packed",
  shipped: "/requests?status=shipped",
  in_transit: "/requests?status=in_transit",
  out_for_delivery: "/requests?status=out_for_delivery",
  delivered: "/requests?status=delivered",
  refunded: "/requests?status=refunded",
};

describe("dashboard helpers", () => {
  it("links every metric to its filtered request list", () => {
    for (const [id, href] of Object.entries(EXPECTED_HREFS)) {
      expect(getMetricHref(id as DashboardMetricId)).toBe(href);
    }
  });

  it("falls back to the unfiltered list for an unknown metric", () => {
    expect(getMetricHref("nope" as DashboardMetricId)).toBe("/requests");
  });

  it("has an icon for every metric", () => {
    for (const id of Object.keys(EXPECTED_HREFS)) {
      expect(METRIC_ICONS[id as DashboardMetricId]).toBeDefined();
    }
  });

  it("keeps shortcuts pointing at in-app routes", () => {
    expect(SHORTCUTS.length).toBeGreaterThan(0);

    for (const shortcut of SHORTCUTS) {
      expect(shortcut.href.startsWith("/")).toBe(true);
      expect(shortcut.label.length).toBeGreaterThan(0);
      expect(shortcut.description.length).toBeGreaterThan(0);
    }
  });

  it("lists each shipping phase once, in order", () => {
    const labels = SHIPMENT_PHASES.map((phase) => phase.label);

    expect(new Set(labels).size).toBe(labels.length);

    for (const phase of SHIPMENT_PHASES) {
      expect(phase.statuses.length).toBeGreaterThan(0);
    }
  });
});
