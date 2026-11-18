// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Input } from "./Input";

afterEach(cleanup);

describe("Input", () => {
  it("links its label to the input", () => {
    render(<Input label="Email" id="email" />);

    expect(screen.getByLabelText("Email").getAttribute("id")).toBe("email");
  });

  it("generates an id when none is given, so the label still works", () => {
    render(<Input label="Phone" />);

    const input = screen.getByLabelText("Phone");
    expect(input.id).toBeTruthy();
  });

  it("marks the field invalid and describes it by the error message", () => {
    render(<Input label="Email" id="email" error="Enter a valid address" />);

    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("email-error");
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid address");
    expect(input.className).toContain("border-red-500");
  });

  it("uses the helper text only while there is no error", () => {
    const { rerender } = render(
      <Input label="Email" id="email" helperText="We never share it" />
    );

    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-describedby")).toBe("email-helper");
    expect(input.getAttribute("aria-invalid")).toBe("false");

    rerender(
      <Input
        label="Email"
        id="email"
        helperText="We never share it"
        error="Required"
      />
    );

    expect(screen.queryByText("We never share it")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Required");
  });
});
