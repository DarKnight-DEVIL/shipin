// @vitest-environment node

/**
 * The seam that lets shared error handling report without importing the tracker.
 *
 * `utils/errors/index.ts` is imported by client components, and `lib/errorTracking` is
 * server-only (it pulls Redis). A static import from the shared module put the tracker
 * into the browser bundle and broke the production build, so reporting goes through this
 * hook instead. What matters here is the two ends of that seam: before the server installs
 * itself nothing may happen, and a reporter that throws must not turn a handled failure
 * into an unhandled one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  reportHandledError,
  resetErrorReporterForTests,
  setErrorReporter,
} from "./errorReporterHook";

const options = {
  category: "payment-settlement",
  severity: "critical",
  code: "TEST_CODE",
} as const;

beforeEach(() => {
  resetErrorReporterForTests();
});

afterEach(() => {
  resetErrorReporterForTests();
});

describe("errorReporterHook", () => {
  it("is a no-op before the server installs a reporter", () => {
    // This is the browser's whole configuration: the hook stays empty.
    expect(() => reportHandledError(new Error("boom"), options)).not.toThrow();
  });

  it("hands the error and its options to the installed reporter", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);

    const error = new Error("settlement failed");
    reportHandledError(error, options);

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(error, options);
  });

  it("passes non-Error values through unchanged", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);

    // Rejections from third-party SDKs are not always Errors, and stringifying them
    // here would lose what the tracker receives.
    reportHandledError("plain string", options);
    reportHandledError({ shape: "odd" }, options);

    expect(reporter.mock.calls.map(([value]) => value)).toEqual([
      "plain string",
      { shape: "odd" },
    ]);
  });

  it("swallows a reporter that throws", () => {
    setErrorReporter(() => {
      throw new Error("tracker exploded");
    });

    // Reporting must never create the failure it was meant to describe.
    expect(() => reportHandledError(new Error("original"), options)).not.toThrow();
  });

  it("keeps reporting after a failed reporter", () => {
    const reporter = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("first call fails");
      })
      .mockImplementation(() => {});

    setErrorReporter(reporter);

    reportHandledError(new Error("one"), options);
    reportHandledError(new Error("two"), options);

    expect(reporter).toHaveBeenCalledTimes(2);
  });

  it("lets the last installation win", () => {
    const first = vi.fn();
    const second = vi.fn();

    setErrorReporter(first);
    setErrorReporter(second);
    reportHandledError(new Error("boom"), options);

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("stops reporting once the hook is reset", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);

    resetErrorReporterForTests();
    reportHandledError(new Error("boom"), options);

    expect(reporter).not.toHaveBeenCalled();
  });
});
