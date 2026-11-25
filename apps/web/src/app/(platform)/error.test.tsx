// @vitest-environment happy-dom

/**
 * The customer-side error boundary.
 *
 * Its whole purpose is that a broken page does not take the shell with it, so
 * the assertions are about what the visitor still has: a heading, a retry
 * affordance, and the digest an operator can match against the server log —
 * without the error message itself, which can carry customer data.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";


import PlatformError from "./error";

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    AlertTriangle: () => null,
    RotateCcw: () => null,
  };
});

describe("(platform)/error", () => {
  it("offers a retry that calls reset", async () => {
    const reset = vi.fn();


    render(<PlatformError error={new Error("boom")} reset={reset} />);

    screen.getByRole("button", { name: /try again/i }).click();

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows the digest and never the error message", () => {
    render(
      <PlatformError
        error={Object.assign(new Error("customer@example.com leaked"), {
          digest: "abc123",
        })}
        reset={vi.fn()}
      />
    );

    expect(screen.getByText(/digest: abc123/)).toBeInTheDocument();
    expect(screen.queryByText(/customer@example.com/)).not.toBeInTheDocument();
  });

  it("announces itself as an alert", () => {
    render(<PlatformError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
