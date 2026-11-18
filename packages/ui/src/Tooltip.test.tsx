// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { Tooltip } from "./Tooltip";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("Tooltip", () => {
  it("renders only the trigger until the pointer waits out the delay", () => {
    render(
      <Tooltip content="Copy to clipboard">
        <button type="button">Copy</button>
      </Tooltip>
    );

    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Copy" }));
    advance(199);
    expect(screen.queryByRole("tooltip")).toBeNull();

    advance(1);
    expect(screen.getByRole("tooltip").textContent).toBe("Copy to clipboard");
  });

  it("hides the tooltip on mouse leave and cancels a pending show", () => {
    render(
      <Tooltip content="Hint" delay={100}>
        <button type="button">Hover</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Hover" });

    fireEvent.mouseEnter(trigger);
    advance(100);
    expect(screen.getByRole("tooltip")).toBeTruthy();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    advance(500);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("also opens on keyboard focus and closes on blur", () => {
    render(
      <Tooltip content="Hint" delay={0}>
        <button type="button">Focusable</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Focusable" });

    fireEvent.focus(trigger);
    advance(0);
    expect(screen.getByRole("tooltip")).toBeTruthy();

    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
