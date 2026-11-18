// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Alert } from "./Alert";

afterEach(cleanup);

describe("Alert", () => {
  it("announces itself as an alert and renders its content", () => {
    render(<Alert>Wallet credit failed</Alert>);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Wallet credit failed");
    expect(alert.className).toContain("bg-blue-50");
  });

  it("applies the class of the requested variant", () => {
    render(<Alert variant="error">Nope</Alert>);

    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("bg-red-50");
    expect(alert.className).not.toContain("bg-blue-50");
  });

  it("renders an optional title above the content", () => {
    render(
      <Alert title="Payment declined" variant="warning">
        Try another card
      </Alert>
    );

    expect(
      screen.getByRole("heading", { name: "Payment declined" })
    ).toBeTruthy();
  });

  it("only offers a dismiss button when it is dismissible", () => {
    const { rerender } = render(<Alert>Static</Alert>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();

    const onDismiss = vi.fn();
    rerender(
      <Alert dismissible onDismiss={onDismiss}>
        Static
      </Alert>
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("forwards arbitrary div props alongside its own classes", () => {
    render(
      <Alert id="alert-1" className="mb-4">
        Hi
      </Alert>
    );

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("id")).toBe("alert-1");
    expect(alert.className).toContain("mb-4");
  });
});
