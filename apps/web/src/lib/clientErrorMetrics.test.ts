import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  warnings: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/errorTracking", () => ({
  captureServerError: mocks.capture,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (_message: string, context: Record<string, unknown>) => {
      mocks.warnings.push(context);
    },
  },
}));

import {
  CLIENT_ERROR_ALERT_THRESHOLD,
  recordClientError,
  resetClientErrorMetricsForTests,
} from "./clientErrorMetrics";

const report = {
  message: "Cannot read properties of undefined (reading 'length')",
  path: "/dashboard",
};

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.warnings.length = 0;
  resetClientErrorMetricsForTests();
});

describe("recordClientError", () => {
  it("logs every report without paging anyone", async () => {
    await recordClientError(report);
    await recordClientError(report);

    expect(mocks.warnings).toHaveLength(2);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("pages once when one error keeps happening", async () => {
    for (let i = 0; i < CLIENT_ERROR_ALERT_THRESHOLD; i += 1) {
      await recordClientError(report);
    }

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        category: "client-error",
        severity: "warning",
        context: expect.objectContaining({ path: "/dashboard" }),
      })
    );
  });

  it("does not page a second time for the same error in the dedupe window", async () => {
    for (let i = 0; i < CLIENT_ERROR_ALERT_THRESHOLD * 2; i += 1) {
      await recordClientError(report);
    }

    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it("treats the same message on a different screen as a different problem", async () => {
    for (let i = 0; i < CLIENT_ERROR_ALERT_THRESHOLD; i += 1) {
      await recordClientError(report);
    }

    for (let i = 0; i < CLIENT_ERROR_ALERT_THRESHOLD; i += 1) {
      await recordClientError({ ...report, path: "/wallet" });
    }

    expect(mocks.capture).toHaveBeenCalledTimes(2);
  });
});
