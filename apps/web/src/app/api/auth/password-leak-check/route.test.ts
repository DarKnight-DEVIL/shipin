import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
}));

vi.mock("@/lib/rateLimiter", () => ({
  apiRateLimiter: { record: mocks.record },
  isRateLimited: (result: { ok: boolean }) => !result.ok,
  addRateLimitHeaders: (headers: Headers, result: { limit: number }) => {
    headers.set("X-RateLimit-Limit", String(result.limit));
  },
}));

import { POST } from "./route";

const fetchMock = vi.fn();
const SUFFIX = "0123456789ABCDEF0123456789ABCDEF012";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/auth/password-leak-check", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mocks.record.mockReset().mockResolvedValue({
    ok: true,
    limit: 30,
    remaining: 29,
    reset: Date.now() + 60_000,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/auth/password-leak-check", () => {
  it("rejects an unreadable body", async () => {
    const response = await POST(request("{nope"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST_BODY",
    });
  });

  it.each(["", "ABC", "ZZZZZ", "ABCDEF", 12345])(
    "rejects the prefix %j",
    async (prefix) => {
      const response = await POST(request({ prefix, suffix: SUFFIX }));

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(["", "ABC", "Z".repeat(35), SUFFIX.slice(0, 34), 12345])(
    "rejects the suffix %j",
    async (suffix) => {
      const response = await POST(request({ prefix: "ABCDE", suffix }));

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("rate-limits before calling HIBP", async () => {
    mocks.record.mockResolvedValue({
      ok: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(
      request({ prefix: "ABCDE", suffix: SUFFIX })
    );

    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("queries HIBP with the upper-cased prefix and a bounded timeout", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

    await POST(request({ prefix: "  abcde ", suffix: SUFFIX }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pwnedpasswords.com/range/ABCDE",
      expect.objectContaining({
        headers: {
          "User-Agent": "ShipIN Security Check",
          "Add-Padding": "true",
        },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("answers leaked true only when the caller's suffix is in the range", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `FFFF:1\r\n${SUFFIX.toLowerCase()}:3\r\n\r\n`,
    });

    const response = await POST(
      request({ prefix: "ABCDE", suffix: SUFFIX })
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      leaked: true,
    });
  });

  it("answers leaked false without relaying the range body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "AAAA:1\r\nBBBB:2\r\n",
    });

    const response = await POST(
      request({ prefix: "ABCDE", suffix: SUFFIX })
    );

    const body = await response.json();

    expect(body).toEqual({ success: true, leaked: false });
    expect(JSON.stringify(body)).not.toContain("AAAA");
  });

  it("reports an unavailable service without failing the check", async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const response = await POST(
      request({ prefix: "ABCDE", suffix: SUFFIX })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      leaked: false,
      serviceUnavailable: true,
    });
  });

  it("returns 502 when the upstream call throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const response = await POST(
      request({ prefix: "ABCDE", suffix: SUFFIX })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "EXTERNAL_SERVICE_ERROR",
    });
    expect(console.error).toHaveBeenCalledWith(
      "Password leak check failed:",
      "network down"
    );
  });
});
