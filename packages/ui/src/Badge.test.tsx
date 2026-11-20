// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Badge, StatusBadge } from "./Badge";

afterEach(cleanup);

describe("Badge", () => {
  it("renders its label with the default variant", () => {
    render(<Badge>Paid</Badge>);

    const badge = screen.getByText("Paid");
    expect(badge.className).toContain("bg-gray-100");
    expect(badge.className).toContain("rounded-full");
  });

  it("adds a status dot only when asked", () => {
    const { container, rerender } = render(<Badge>Draft</Badge>);
    expect(container.querySelectorAll("span > span")).toHaveLength(0);

    rerender(
      <Badge dot variant="success">
        Active
      </Badge>
    );

    const dot = container.querySelector("span > span");
    expect(dot?.className).toContain("bg-green-500");
  });
});

describe("StatusBadge", () => {
  it("maps a known status to its label and variant", () => {
    render(<StatusBadge status="in_transit" />);

    const badge = screen.getByText("In Transit");
    expect(badge.className).toContain("bg-blue-100");
  });

  it("falls back to the raw status for an unknown value", () => {
    render(<StatusBadge status="awaiting_customs" />);

    const badge = screen.getByText("awaiting_customs");
    expect(badge.className).toContain("bg-gray-100");
  });
});
