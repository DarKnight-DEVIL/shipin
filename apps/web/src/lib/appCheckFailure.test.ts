/**
 * Tests for the App Check failure signal that drives the retry banner.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  clearAppCheckFailure,
  isAppCheckFailureActive,
  notifyAppCheckFailure,
  subscribeAppCheckFailure,
} from "./appCheckFailure";

beforeEach(() => {
  clearAppCheckFailure();
});

describe("app check failure signal", () => {
  it("starts inactive", () => {
    expect(isAppCheckFailureActive()).toBe(false);
  });

  it("activates on a rejection and notifies subscribers", () => {
    const listener = vi.fn();
    subscribeAppCheckFailure(listener);

    notifyAppCheckFailure();

    expect(isAppCheckFailureActive()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies once per transition, not once per failing request", () => {
    const listener = vi.fn();
    subscribeAppCheckFailure(listener);

    notifyAppCheckFailure();
    notifyAppCheckFailure();
    notifyAppCheckFailure();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears on recovery and notifies", () => {
    const listener = vi.fn();
    subscribeAppCheckFailure(listener);

    notifyAppCheckFailure();
    clearAppCheckFailure();

    expect(isAppCheckFailureActive()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not notify when clearing an already-clear signal", () => {
    const listener = vi.fn();
    subscribeAppCheckFailure(listener);

    clearAppCheckFailure();

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppCheckFailure(listener);

    unsubscribe();
    notifyAppCheckFailure();

    expect(listener).not.toHaveBeenCalled();
  });
});
