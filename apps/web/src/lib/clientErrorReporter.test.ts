/** @vitest-environment happy-dom */

/**
 * The reporter is a guest in the app: it must not amplify a bug (a render loop
 * throwing every frame becomes one report), must not leak a token, and must
 * never throw from inside the error path.
 */

import { describe, expect, it, vi } from "vitest";

import {
  installClientErrorReporter,
  MAX_REPORTS,
  toClientError,
} from "./clientErrorReporter";

function windowAt(pathname: string) {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    location: { pathname },
    addEventListener: (name: string, listener: EventListener) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    },
    removeEventListener: (name: string, listener: EventListener) => {
      listeners.delete(name);
    },
    emit(name: string, event: unknown) {
      for (const listener of listeners.get(name) ?? []) listener(event as Event);
    },
  };
}

describe("toClientError", () => {
  it("drops the query string, so a token never reaches the logs", () => {
    // `pathname` has no query by construction; this asserts the field that is
    // sent is the path and not `href`.
    const payload = toClientError("boom", { pathname: "/track/SHP-1" });

    expect(payload.path).toBe("/track/SHP-1");
  });

  it("bounds the message and the stack", () => {
    const payload = toClientError("x".repeat(900), { pathname: "/" }, {
      stack: "y".repeat(5000),
    });

    expect(payload.message).toHaveLength(500);
    expect(payload.stack).toHaveLength(2000);
  });

  it("survives a non-string rejection reason", () => {
    expect(toClientError({ weird: true }, { pathname: "/" }).message).toBe(
      "Unknown client error"
    );
  });
});

describe("installClientErrorReporter", () => {
  it("reports an uncaught error once, not once per occurrence", () => {
    const send = vi.fn();
    const win = windowAt("/dashboard");
    installClientErrorReporter(win as unknown as Window, { send });

    const event = { message: "Cannot read properties of undefined", error: new Error("x") };
    win.emit("error", event);
    win.emit("error", event);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("caps the reports in one session", () => {
    const send = vi.fn();
    const win = windowAt("/");
    installClientErrorReporter(win as unknown as Window, { send });

    for (let i = 0; i < MAX_REPORTS + 4; i += 1) {
      win.emit("error", { message: `error ${i}` });
    }

    expect(send).toHaveBeenCalledTimes(MAX_REPORTS);
  });

  it("reports unhandled rejections too", () => {
    const send = vi.fn();
    const win = windowAt("/");
    installClientErrorReporter(win as unknown as Window, { send });

    win.emit("unhandledrejection", { reason: new Error("async boom") });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ message: "async boom", path: "/" })
    );
  });

  it("stops listening once cleaned up", () => {
    const send = vi.fn();
    const win = windowAt("/");
    const cleanup = installClientErrorReporter(win as unknown as Window, {
      send,
    });

    cleanup();
    win.emit("error", { message: "after cleanup" });

    expect(send).not.toHaveBeenCalled();
  });
});

describe("default sender", () => {
  it("posts to the endpoint with keepalive, and swallows a failing fetch", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const win = windowAt("/wallet");
    installClientErrorReporter(win as unknown as Window);

    win.emit("error", { message: "boom" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/client-errors",
      expect.objectContaining({ method: "POST", keepalive: true })
    );

    // Let the rejection settle: reporting must never surface it.
    await Promise.resolve();

    vi.unstubAllGlobals();
  });
});
