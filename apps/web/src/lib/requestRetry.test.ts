import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  beginRetryNotice,
  endRetryNotice,
  isRetryPending,
  subscribeRetryNotice,
} from "./requestRetry";

/** The store is module state: reset it between tests. */
function reset() {
  while (isRetryPending()) endRetryNotice();
}

beforeEach(() => {
  reset();
});

describe("retry notice signal", () => {
  it("starts idle", () => {
    expect(isRetryPending()).toBe(false);
  });

  it("stays up until the last retry settles", () => {
    const listener = vi.fn();
    subscribeRetryNotice(listener);

    // Two requests backing off at once: the first to finish must not hide the
    // notice while the second is still waiting.
    beginRetryNotice();
    beginRetryNotice();
    expect(isRetryPending()).toBe(true);

    endRetryNotice();
    expect(isRetryPending()).toBe(true);

    endRetryNotice();
    expect(isRetryPending()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("never goes negative on a mismatched pair", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRetryNotice(listener);

    endRetryNotice();
    endRetryNotice();

    expect(isRetryPending()).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();

    // A stray end must not later swallow a real begin.
    beginRetryNotice();
    expect(isRetryPending()).toBe(true);
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRetryNotice(listener);

    unsubscribe();
    beginRetryNotice();

    expect(listener).not.toHaveBeenCalled();
  });
});
