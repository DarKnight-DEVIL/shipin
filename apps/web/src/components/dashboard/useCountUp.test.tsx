// @vitest-environment happy-dom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useCountUp from "./useCountUp";

let frame: FrameRequestCallback | null = null;
let clock = 0;

beforeEach(() => {
  frame = null;
  clock = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frame = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function flushFrame(nowMs: number) {
  const cb = frame;
  frame = null;
  clock = nowMs;
  act(() => {
    cb?.(nowMs);
  });
}

describe("useCountUp", () => {
  it("eases up to the target and stops on the final frame", () => {
    const { result } = renderHook(() => useCountUp(100, 100));

    expect(result.current).toBe(0);

    flushFrame(50);
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);

    flushFrame(100);
    expect(result.current).toBe(100);
    expect(frame).toBeNull();
  });

  it("jumps straight to the target when motion is reduced", () => {
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useCountUp(42, 100));
    flushFrame(0);

    expect(result.current).toBe(42);
  });

  it("stays at zero for a zero target", () => {
    const { result } = renderHook(() => useCountUp(0, 100));
    flushFrame(100);

    expect(result.current).toBe(0);
  });

  it("cancels the pending frame on unmount", () => {
    const { unmount } = renderHook(() => useCountUp(100, 100));
    const pending = frame;

    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
    // The captured callback must not have been scheduled again after unmount.
    expect(frame).toBe(pending);
  });
});
