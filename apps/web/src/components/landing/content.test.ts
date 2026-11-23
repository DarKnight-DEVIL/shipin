import { describe, expect, it } from "vitest";

import {
  corridors,
  faqs,
  marketTicker,
  metrics,
  plans,
  steps,
} from "./content";

describe("landing content", () => {
  it("keeps unique plan tiers with stable ids", () => {
    expect(plans.map((plan) => plan.id)).toEqual([
      "standard",
      "express",
      "merchant",
    ]);
    expect(new Set(plans.map((plan) => plan.id)).size).toBe(plans.length);
  });

  it("keeps the published counts consistent with the data", () => {
    expect(corridors).toHaveLength(6);
    expect(new Set(corridors.map((corridor) => corridor.route)).size).toBe(
      corridors.length
    );
    expect(marketTicker).toContain("London");
    expect(
      metrics.find((metric) => metric.label === "Published corridors")?.value
    ).toBe(String(corridors.length));
    expect(steps.map((step) => step.number)).toEqual(["01", "02", "03", "04"]);
    expect(faqs.length).toBeGreaterThan(0);
  });
});
