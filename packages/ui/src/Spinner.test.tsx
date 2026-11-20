// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ButtonSpinner, PageSpinner, Spinner } from "./Spinner";

afterEach(cleanup);

describe("Spinner", () => {
  it("exposes a status role with a screen-reader label", () => {
    render(<Spinner />);

    const spinner = screen.getByRole("status", { name: "Loading" });
    expect(spinner.textContent).toContain("Loading...");
  });

  it("applies the size and colour classes", () => {
    render(<Spinner size="lg" color="white" />);

    const spinner = screen.getByRole("status");
    expect(spinner.className).toContain("w-8");
    expect(spinner.className).toContain("border-white");
  });
});

describe("PageSpinner / ButtonSpinner", () => {
  it("renders a large centered spinner for a page", () => {
    const { container } = render(<PageSpinner />);

    expect(container.firstElementChild?.className).toContain("min-h-[400px]");
    expect(screen.getByRole("status").className).toContain("w-8");
  });

  it("renders a small white spinner for a button", () => {
    render(<ButtonSpinner className="ml-2" />);

    const spinner = screen.getByRole("status");
    expect(spinner.className).toContain("w-4");
    expect(spinner.className).toContain("border-white");
    expect(spinner.className).toContain("ml-2");
  });
});
