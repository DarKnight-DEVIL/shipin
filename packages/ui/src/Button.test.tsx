// @vitest-environment happy-dom

import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("renders its label and clicks", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Pay now</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies the variant and size classes", () => {
    render(
      <Button variant="destructive" size="lg">
        Delete
      </Button>
    );

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("bg-red-600");
    expect(button.className).toContain("px-6");
  });

  it("shows a spinner and blocks clicks while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>
    );

    const button = screen.getByRole("button", {
      name: /Saving/,
    }) as HTMLButtonElement | null;
    expect(button?.disabled).toBe(true);
    expect(button?.querySelector("svg")).toBeTruthy();

    fireEvent.click(button as HTMLButtonElement);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards its ref to the underlying element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Go</Button>);

    expect(ref.current?.tagName).toBe("BUTTON");
  });

  it("keeps a disabled button non-interactive", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Locked
      </Button>
    );

    fireEvent.click(screen.getByRole("button", { name: "Locked" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
