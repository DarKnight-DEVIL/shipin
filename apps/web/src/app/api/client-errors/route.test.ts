import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  limit: { ok: true, limit: 10, remaining: 9, reset: Date.now() + 60_000 },
}));

vi.mock("@/lib/clientErrorMetrics", () => ({ recordClientError: mocks.record }));

// The limiter is the interesting half of this route, so it is stubbed with a
// controllable result rather than a real store.
vi.mock("@/lib/rateLimiter", () => ({
  strictRateLimiter: {
    record: async () => mocks.limit,
  },
}));

import { NextRequest } from "next/server";

import { POST } from "./route";

function requestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.record.mockReset();
  mocks.limit = { ok: true, limit: 10, remaining: 9, reset: Date.now() + 60_000 };
});

describe("POST /api/client-errors", () => {
  it("accepts a bounded report and answers 204", async () => {
    const response = await POST(
      requestWith({ message: "boom", path: "/dashboard" })
    );

    expect(response.status).toBe(204);
    expect(mocks.record).toHaveBeenCalledWith({
      message: "boom",
      path: "/dashboard",
    });
  });

  it("answers 204 even when the body is rejected, so it cannot be probed", async () => {
    const response = await POST(requestWith({ message: "boom", path: "nope" }));

    expect(response.status).toBe(204);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("drops the report when the limiter refuses", async () => {
    mocks.limit = {
      ok: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
    };

    const response = await POST(
      requestWith({ message: "boom", path: "/dashboard" })
    );

    expect(response.status).toBe(204);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("still records during a store outage, because an outage is not abuse", async () => {
    mocks.limit = {
      ok: false,
      unavailable: true,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
    } as never;

    await POST(requestWith({ message: "boom", path: "/dashboard" }));

    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it("never echoes what it stored", async () => {
    const response = await POST(
      requestWith({ message: "boom", path: "/dashboard" })
    );

    expect(await response.text()).toBe("");
  });
});
