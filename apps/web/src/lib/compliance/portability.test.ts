import { describe, expect, it } from "vitest";

import { PERSONAL_DATA_CATEGORIES } from "./dpdp";
import { getDataPortabilityExport } from "./portability";

/**
 * The export has to stay machine-readable whatever the caller puts in `data`,
 * because it is handed to the data subject as-is (DPDP Sec 11(2), GDPR Art 20).
 */
describe("getDataPortabilityExport", () => {
  it("returns a JSON document naming the category and the user", () => {
    const parsed = JSON.parse(
      getDataPortabilityExport(PERSONAL_DATA_CATEGORIES.ACCOUNT, "user-1")
    ) as Record<string, unknown>;

    expect(parsed.category).toBe(PERSONAL_DATA_CATEGORIES.ACCOUNT);
    expect(parsed.userId).toBe("user-1");
  });

  it("stamps the export with a parseable ISO timestamp", () => {
    const before = Date.now();
    const parsed = JSON.parse(
      getDataPortabilityExport(PERSONAL_DATA_CATEGORIES.ORDER, "user-2")
    ) as { exportedAt: string };

    const exportedAt = Date.parse(parsed.exportedAt);
    expect(Number.isNaN(exportedAt)).toBe(false);
    expect(exportedAt).toBeGreaterThanOrEqual(before);
    expect(exportedAt).toBeLessThanOrEqual(Date.now());
  });

  it("always carries a data object, even before a caller fills it", () => {
    const parsed = JSON.parse(
      getDataPortabilityExport(PERSONAL_DATA_CATEGORIES.PAYMENT, "user-3")
    ) as { data: unknown };

    expect(parsed.data).toEqual({});
  });

  it("passes an arbitrary category through unchanged", () => {
    const parsed = JSON.parse(
      getDataPortabilityExport(PERSONAL_DATA_CATEGORIES.SUPPORT, "user-4")
    ) as { category: string };

    expect(parsed.category).toBe("support");
  });
});
