import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  customerApi: vi.fn(),
}));

vi.mock("@/lib/customerApiClient", () => ({ customerApi: mocks.customerApi }));

import {
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
  dashboardMetrics,
} from "./dashboardMetrics";
import { getUserPreferences, saveDashboardMetrics } from "./userPreferences";
import type { DashboardMetricId } from "./dashboardMetrics";

beforeEach(() => {
  mocks.customerApi.mockReset();
  mocks.customerApi.mockResolvedValue({ success: true });
});

describe("dashboardMetrics catalogue", () => {
  it("has unique ids and non-empty copy", () => {
    const ids = dashboardMetrics.map((metric) => metric.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const metric of dashboardMetrics) {
      expect(metric.label).toBeTruthy();
      expect(metric.description).toBeTruthy();
    }
  });

  it("defaults to four valid metrics", () => {
    expect(DEFAULT_DASHBOARD_METRICS).toHaveLength(MIN_DASHBOARD_METRICS);
    const ids = dashboardMetrics.map((metric) => metric.id);
    for (const id of DEFAULT_DASHBOARD_METRICS) {
      expect(ids).toContain(id);
    }
  });
});

describe("getUserPreferences", () => {
  it("falls back to defaults when the user has no document", async () => {
    mocks.customerApi.mockResolvedValue({ dashboardMetrics: null });

    await expect(getUserPreferences("user-1")).resolves.toEqual({
      dashboardMetrics: DEFAULT_DASHBOARD_METRICS,
    });
    expect(mocks.customerApi).toHaveBeenCalledWith("/api/profile/preferences");
  });

  it("returns saved metrics that pass validation", async () => {
    const saved: DashboardMetricId[] = [
      "active",
      "paid",
      "shipped",
      "refunded",
    ];
    mocks.customerApi.mockResolvedValue({ dashboardMetrics: saved });

    await expect(getUserPreferences("user-1")).resolves.toEqual({
      dashboardMetrics: saved,
    });
  });

  it("drops unknown metric ids but keeps the rest", async () => {
    mocks.customerApi.mockResolvedValue({
      dashboardMetrics: [
        "active",
        "paid",
        "shipped",
        "refunded",
        "bogus",
        42,
      ],
    });

    await expect(getUserPreferences("user-1")).resolves.toEqual({
      dashboardMetrics: ["active", "paid", "shipped", "refunded"],
    });
  });

  it("falls back when too few valid metrics remain", async () => {
    mocks.customerApi.mockResolvedValue({
      dashboardMetrics: ["active", "bogus", "nope"],
    });

    await expect(getUserPreferences("user-1")).resolves.toEqual({
      dashboardMetrics: DEFAULT_DASHBOARD_METRICS,
    });
  });

  it("falls back when the stored value is not an array", async () => {
    mocks.customerApi.mockResolvedValue({ dashboardMetrics: "active" });

    await expect(getUserPreferences("user-1")).resolves.toEqual({
      dashboardMetrics: DEFAULT_DASHBOARD_METRICS,
    });
  });

  it("wraps read failures", async () => {
    mocks.customerApi.mockRejectedValue(new Error("permission-denied"));

    await expect(getUserPreferences("user-1")).rejects.toMatchObject({
      name: "AuthorizationError",
    });
  });
});

describe("saveDashboardMetrics", () => {
  it("requires the minimum number of cards", async () => {
    await expect(
      saveDashboardMetrics("user-1", ["active", "paid"])
    ).rejects.toThrow(
      `Select at least ${MIN_DASHBOARD_METRICS} dashboard cards.`
    );
    expect(mocks.customerApi).not.toHaveBeenCalled();
  });

  it("rejects unknown metric ids", async () => {
    await expect(
      saveDashboardMetrics("user-1", [
        "active",
        "paid",
        "shipped",
        "bogus" as DashboardMetricId,
      ])
    ).rejects.toThrow("One or more dashboard metrics are invalid.");
  });

  it("saves a valid selection", async () => {
    const metrics: DashboardMetricId[] = [
      "active",
      "paid",
      "shipped",
      "refunded",
    ];

    await saveDashboardMetrics("user-1", metrics);

    expect(mocks.customerApi).toHaveBeenCalledWith("/api/profile/preferences", {
      method: "PATCH",
      body: { metrics },
    });
  });

  it("wraps API failures", async () => {
    mocks.customerApi.mockRejectedValue(new Error("offline"));

    await expect(
      saveDashboardMetrics("user-1", ["active", "paid", "shipped", "refunded"])
    ).rejects.toBeInstanceOf(Error);
  });
});
