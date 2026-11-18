// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PRICING } from "@/config/pricing";
import ServiceSummary from "./ServiceSummary";

function rowText(name: string): string {
  // Name block and price span share the row.
  return screen.getByText(name).parentElement!.parentElement!.textContent ?? "";
}

describe("ServiceSummary", () => {
  it("labels a zero-priced standard inspection as included", () => {
    render(<ServiceSummary inspection="standard" shipping="auto" />);

    const row = rowText(PRICING.inspection.standard.name);
    expect(row).toContain("Included");
    expect(row).not.toContain("FREE");
  });

  it("still shows a price for a paid inspection", () => {
    render(<ServiceSummary inspection="detailed" shipping="auto" />);

    expect(rowText(PRICING.inspection.detailed.name)).toContain(
      `+$${PRICING.inspection.detailed.price}`
    );
  });
});
