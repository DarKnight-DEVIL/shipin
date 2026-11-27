import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// These suites rebuild their module graph per test (they reset modules so each
// case gets a fresh instance). That is cheap normally but can exceed the
// default 5s ceiling when the whole suite runs unisolated on a loaded machine,
// which surfaced as spurious timeouts. The assertions are unchanged.
vi.setConfig({ testTimeout: 15_000 });
import { NextRequest } from "next/server";

import { POST } from "./route";

function reportRequest(body: unknown) {
  return new NextRequest("http://localhost/api/csp-report", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/csp-report" },
  });
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/csp-report", () => {
  it("rejects an unreadable body", async () => {
    const response = await POST(reportRequest("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Invalid JSON body.",
    });
  });

  it("logs the violated directive and blocked uri", async () => {
    const response = await POST(
      reportRequest({
        "csp-report": {
          "violated-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js",
        },
      })
    );

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("CSP violation reported")
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("\"violatedDirective\":\"script-src-elem\"")
    );
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it("flattens control characters so a report cannot forge a log line", async () => {
    const response = await POST(
      reportRequest({
        "csp-report": {
          "violated-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js\n{\"level\":\"info\"}",
        },
      })
    );

    expect(response.status).toBe(200);
    const logged = (console.warn as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as string;

    expect(logged).toContain(
      "https://evil.example/x.js {\\\"level\\\":\\\"info\\\"}"
    );
    expect(logged).not.toContain("x.js\\n");
  });

  it("accepts a report with an unexpected shape", async () => {
    const response = await POST(
      reportRequest({ "csp-report": "not-an-object" })
    );

    expect(response.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("CSP violation reported")
    );
  });

  it("acknowledges a report in production without any error-reporting SDK", async () => {
    // The deployment ships no error-reporting service, so logging is the whole
    // sink: the endpoint must still answer 200 and stay silent on the wire.
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(
      reportRequest({ "csp-report": { "violated-directive": "img-src" } })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("CSP violation reported")
    );
  });
});
