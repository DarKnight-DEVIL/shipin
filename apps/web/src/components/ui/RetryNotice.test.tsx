// @vitest-environment happy-dom

/**
 * Tests for the inline retry notice.
 *
 * The notice exists so a silent backoff does not read as a frozen page: it has
 * to appear while a retry waits, announce itself politely, and disappear on its
 * own once the retry settles.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

import {
  beginRetryNotice,
  endRetryNotice,
  isRetryPending,
} from "@/lib/requestRetry";
import RetryNotice from "./RetryNotice";

function reset() {
  while (isRetryPending()) endRetryNotice();
}

beforeEach(() => {
  reset();
});

afterEach(() => {
  reset();
});

describe("RetryNotice", () => {
  it("renders nothing while no retry is pending", () => {
    render(<RetryNotice />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("appears while a request is backing off", () => {
    render(<RetryNotice />);

    act(() => beginRetryNotice());

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/retrying/i);
    // Polite: a retry is progress, not an alarm.
    expect(notice.getAttribute("aria-live")).toBe("polite");
  });

  it("disappears when the retry settles", () => {
    render(<RetryNotice />);

    act(() => beginRetryNotice());
    expect(screen.getByRole("status")).toBeTruthy();

    act(() => endRetryNotice());

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays up while another retry is still waiting", () => {
    render(<RetryNotice />);

    act(() => {
      beginRetryNotice();
      beginRetryNotice();
    });
    act(() => endRetryNotice());

    expect(screen.getByRole("status")).toBeTruthy();
  });
});
