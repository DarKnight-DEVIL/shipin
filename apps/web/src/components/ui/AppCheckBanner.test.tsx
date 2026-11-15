// @vitest-environment happy-dom

/**
 * Tests for the App Check retry banner.
 *
 * The banner is the only place a blocked attestation is explained in words the
 * user can act on, so what matters is that it appears on the rejection, names
 * the problem, and retries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  clearAppCheckFailure,
  isAppCheckFailureActive,
  notifyAppCheckFailure,
} from "@/lib/appCheckFailure";
import AppCheckBanner from "./AppCheckBanner";

beforeEach(() => {
  clearAppCheckFailure();
});

afterEach(() => {
  clearAppCheckFailure();
});

describe("AppCheckBanner", () => {
  it("renders nothing until a rejection is reported", () => {
    render(<AppCheckBanner onRetry={vi.fn()} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains the failure and offers a retry once reported", () => {
    render(<AppCheckBanner onRetry={vi.fn()} />);

    act(() => notifyAppCheckFailure());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Security check failed/i);
    expect(alert).toHaveTextContent(/could not be verified/i);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("calls the retry handler", () => {
    const onRetry = vi.fn();
    render(<AppCheckBanner onRetry={onRetry} />);

    act(() => notifyAppCheckFailure());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disappears when a later request succeeds", () => {
    render(<AppCheckBanner onRetry={vi.fn()} />);

    act(() => notifyAppCheckFailure());
    expect(screen.getByRole("alert")).toBeTruthy();

    act(() => clearAppCheckFailure());

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("can be dismissed without resolving the rejection", () => {
    render(<AppCheckBanner onRetry={vi.fn()} />);

    act(() => notifyAppCheckFailure());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).toBeNull();
    // Still outstanding: only a successful request resolves it.
    expect(isAppCheckFailureActive()).toBe(true);
  });

  it("comes back when a new request is rejected after dismissal", () => {
    render(<AppCheckBanner onRetry={vi.fn()} />);

    act(() => notifyAppCheckFailure());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();

    // The user hid one blocked request, not every future one.
    act(() => notifyAppCheckFailure());

    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("stays dismissed after a success, ready for the next rejection", () => {
    render(<AppCheckBanner onRetry={vi.fn()} />);

    act(() => notifyAppCheckFailure());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    act(() => clearAppCheckFailure());

    expect(screen.queryByRole("alert")).toBeNull();

    act(() => notifyAppCheckFailure());

    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("links to support for a device that stays blocked", () => {
    render(<AppCheckBanner onRetry={vi.fn()} />);

    act(() => notifyAppCheckFailure());

    const support = screen.getByRole("link", { name: "Contact support" });
    expect(support.getAttribute("href")).toBe("/support");
  });

  it("points at the admin support centre when given a different href", () => {
    render(<AppCheckBanner onRetry={vi.fn()} supportHref="/admin/support" />);

    act(() => notifyAppCheckFailure());

    expect(
      screen.getByRole("link", { name: "Contact support" }).getAttribute("href")
    ).toBe("/admin/support");
  });
});
