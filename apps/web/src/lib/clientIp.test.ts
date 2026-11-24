import { afterEach, describe, expect, it, vi } from "vitest";

import { getClientIp } from "./clientIp";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/test", { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getClientIp", () => {
  it("trusts nothing when neither proxy mode is configured", () => {
    // The Docker image publishes the app directly. Reading these headers there
    // would let a client rotate its own rate-limit bucket per request.
    expect(
      getClientIp(
        requestWith({
          "x-vercel-forwarded-for": "203.0.113.7",
          "x-real-ip": "198.51.100.7",
          "x-forwarded-for": "1.2.3.4, 10.0.0.2",
        })
      )
    ).toBeNull();
  });

  it("uses the platform header on Vercel, which a client cannot forge", () => {
    vi.stubEnv("VERCEL", "1");

    expect(
      getClientIp(
        requestWith({
          "x-vercel-forwarded-for": "203.0.113.7",
          "x-forwarded-for": "198.51.100.1",
        })
      )
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip on Vercel", () => {
    vi.stubEnv("VERCEL", "1");

    expect(getClientIp(requestWith({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7"
    );
  });

  it("takes the last hop of x-forwarded-for, never the client-supplied first one", () => {
    vi.stubEnv("VERCEL", "1");

    expect(
      getClientIp(
        requestWith({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" })
      )
    ).toBe("10.0.0.2");
  });

  it("reads a sanitised chain when TRUST_PROXY opts the deployment in", () => {
    vi.stubEnv("TRUST_PROXY", "1");

    expect(getClientIp(requestWith({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7"
    );
    expect(
      getClientIp(requestWith({ "x-forwarded-for": "1.2.3.4, 10.0.0.2" }))
    ).toBe("10.0.0.2");
  });

  it("needs TRUST_PROXY even when the request looks proxied", () => {
    expect(
      getClientIp(requestWith({ "x-forwarded-for": "1.2.3.4, 10.0.0.2" }))
    ).toBeNull();
  });

  it("ignores cf-connecting-ip, because the deployment does not vouch for it", () => {
    // A browser can send any header. Trusting this one let an attacker rotate
    // it per request and mint a fresh rate-limit bucket every time.
    expect(
      getClientIp(
        requestWith({
          "cf-connecting-ip": "9.9.9.9",
          "cf-ray": "8a1b2c3d4e5f-SIN",
        })
      )
    ).toBeNull();
  });

  it("skips empty entries in the forwarded chain", () => {
    vi.stubEnv("TRUST_PROXY", "1");

    expect(
      getClientIp(requestWith({ "x-forwarded-for": "1.2.3.4, , 10.0.0.2" }))
    ).toBe("10.0.0.2");
  });

  it("ignores an empty platform header and keeps looking", () => {
    vi.stubEnv("VERCEL", "1");

    expect(
      getClientIp(
        requestWith({
          "x-vercel-forwarded-for": "   ",
          "x-real-ip": "198.51.100.7",
        })
      )
    ).toBe("198.51.100.7");
  });

  it("trims whitespace around the address", () => {
    vi.stubEnv("VERCEL", "1");

    expect(getClientIp(requestWith({ "x-vercel-forwarded-for": " 203.0.113.7 " }))).toBe(
      "203.0.113.7"
    );
  });

  it("returns null when no address header is present", () => {
    expect(getClientIp(requestWith({}))).toBeNull();
  });
});
