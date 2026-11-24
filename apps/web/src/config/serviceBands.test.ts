/**
 * The landing page's price copy must be the price the quote charges.
 *
 * Each assertion below ties a sentence the page renders to the function that
 * bills the customer, so the next change to either side fails here instead of
 * shipping a page that promises something checkout will not honour.
 */

import { describe, it, expect } from "vitest";

import { PRICING } from "@/config/pricing";
import { SERVICE_BANDS, formatUsd } from "./serviceBands";
import { calculateServiceFee } from "@/features/finance/services/calculateServiceFee";
import {
  getStorageParams,
  STORAGE_DAILY_FINE_USD,
} from "@/features/requests/services/warehousePolicy";

const band = (id: string) => {
  const found = SERVICE_BANDS.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing band: ${id}`);
  return found;
};

const features = (id: string) => band(id).features.join(" ");

describe("SERVICE_BANDS", () => {
  it("shows the free band as the fee calculateServiceFee charges", () => {
    const { fee, rule } = calculateServiceFee(PRICING.FREE_SERVICE_LIMIT);

    expect(rule).toBe("Free Service");
    expect(band("free").price).toBe(formatUsd(fee));
    expect(band("free").code).toContain(formatUsd(PRICING.FREE_SERVICE_LIMIT));
  });

  it("shows the flat band as the fee calculateServiceFee charges", () => {
    const { fee, rule } = calculateServiceFee(PRICING.FLAT_FEE_LIMIT);

    expect(rule).toBe("Flat $5 Service Fee");
    expect(band("flat").price).toBe(formatUsd(fee));
    expect(band("flat").code).toContain(formatUsd(PRICING.FLAT_FEE_LIMIT));
  });

  it("shows the percentage band as the fee calculateServiceFee charges", () => {
    // A mid-range order, so the minimum does not mask the rate.
    const productsTotal = PRICING.FLAT_FEE_LIMIT * 4;
    const { fee, rule } = calculateServiceFee(productsTotal);

    expect(rule).toBe("10% Service Fee");
    expect(fee).toBe(productsTotal * PRICING.PERCENTAGE);
    expect(band("percentage").name).toBe(
      `${PRICING.PERCENTAGE * 100}% of products`
    );
    expect(band("percentage").unit).toContain(
      formatUsd(PRICING.MIN_PERCENTAGE_FEE)
    );
  });

  it("stops at the band where a human writes the quote", () => {
    const { manualQuote } = calculateServiceFee(PRICING.PERCENTAGE_LIMIT + 1);

    expect(manualQuote).toBe(true);
    expect(band("percentage").code).toContain(
      formatUsd(PRICING.PERCENTAGE_LIMIT)
    );
  });

  it("quotes the storage window and fine warehousePolicy applies", () => {
    const shortest = getStorageParams("auto").freeStorageDays;
    const longest = getStorageParams("hold").freeStorageDays;

    expect(features("free")).toContain(`${shortest} to ${longest} days`);
    expect(features("percentage")).toContain(`${longest} days free`);
    expect(features("percentage")).toContain(
      `${formatUsd(STORAGE_DAILY_FINE_USD)} per day`
    );
  });

  it("sells no tier the product cannot charge", () => {
    const copy = JSON.stringify(SERVICE_BANDS);

    // The removed fiction: a $9 Express tier and 30 days of warehousing.
    expect(copy).not.toMatch(/express/i);
    expect(copy).not.toContain("30 days");
    expect(copy).not.toContain("$9");
    // No card may promise a tier, because calculateServiceFee takes no tier.
    expect(copy).not.toMatch(/\btier\b/i);
  });

  it("gives every band a price, a unit and a way to start", () => {
    expect(SERVICE_BANDS).toHaveLength(3);

    for (const entry of SERVICE_BANDS) {
      expect(entry.price).toMatch(/^\$|%$/);
      expect(entry.unit.length).toBeGreaterThan(0);
      expect(entry.features.length).toBeGreaterThan(0);
      expect(entry.cta).toBe("Start a request");
    }
  });

  it("formats money without trailing zeros", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(5)).toBe("$5");
    expect(formatUsd(523.33)).toBe("$523.33");
  });
});
