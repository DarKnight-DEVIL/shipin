/**
 * Tests for rate-limit bucketing.
 *
 * What matters here is that a signed-in caller stops sharing an address budget
 * (mobile carriers and offices in the launch market put thousands of people
 * behind one address) while an attacker cannot manufacture unlimited budget by
 * inventing tokens, since the token is decoded and not verified.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryRateLimiter } from "./rateLimiter";
import {
  TOKEN_IP_CEILING_MULTIPLIER,
  UNIDENTIFIED_SUBJECT,
  rateLimitSubject,
  readBearerUid,
} from "./rateLimitSubject";

/** Build an unsigned JWT-looking token with the given payload. */
function fakeToken(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request("https://shipin.test/api/requests", { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readBearerUid", () => {
  it("reads sub from a token even though it is not verified", () => {
    const request = requestWith({
      authorization: `Bearer ${fakeToken({ sub: "abc123USER" })}`,
    });

    expect(readBearerUid(request)).toBe("abc123USER");
  });

  it("returns null without an Authorization header", () => {
    expect(readBearerUid(requestWith())).toBeNull();
  });

  it("returns null for opaque non-JWT tokens", () => {
    const request = requestWith({ authorization: "Bearer not-a-jwt" });

    expect(readBearerUid(request)).toBeNull();
  });

  it("returns null when the payload is not JSON", () => {
    const encode = (text: string) =>
      Buffer.from(text).toString("base64").replace(/=+$/, "");
    const request = requestWith({
      authorization: `Bearer ${encode("{}")}.${encode("not json")}.sig`,
    });

    expect(readBearerUid(request)).toBeNull();
  });

  it("refuses a sub that is not uid-shaped, so it can never reach a bucket", () => {
    // A colon or slash would let the caller shape the Redis key itself.
    const request = requestWith({
      authorization: `Bearer ${fakeToken({ sub: "a:b/c d" })}`,
    });

    expect(readBearerUid(request)).toBeNull();
  });

  it("ignores a non-string sub", () => {
    const request = requestWith({
      authorization: `Bearer ${fakeToken({ sub: 12345 })}`,
    });

    expect(readBearerUid(request)).toBeNull();
  });
});

describe("rateLimitSubject", () => {
  it("keys an anonymous request by the trusted client address", () => {
    vi.stubEnv("VERCEL", "1");
    const request = requestWith({ "x-vercel-forwarded-for": "203.0.113.9" });

    expect(rateLimitSubject(request)).toEqual({
      key: "203.0.113.9",
      kind: "ip",
      ip: "203.0.113.9",
    });
  });

  it("keeps the bare address as the key so existing counters still apply", () => {
    const request = requestWith();

    expect(rateLimitSubject(request)).toMatchObject({
      key: UNIDENTIFIED_SUBJECT,
      kind: "ip",
    });
  });

  it("gives each signed-in account its own bucket", () => {
    vi.stubEnv("VERCEL", "1");
    const shared = { "x-vercel-forwarded-for": "203.0.113.9" };

    const first = rateLimitSubject(
      requestWith({
        ...shared,
        authorization: `Bearer ${fakeToken({ sub: "userOne" })}`,
      })
    );
    const second = rateLimitSubject(
      requestWith({
        ...shared,
        authorization: `Bearer ${fakeToken({ sub: "userTwo" })}`,
      })
    );

    expect(first.key).toBe("u:userOne");
    expect(second.key).toBe("u:userTwo");
    expect(first.key).not.toBe(second.key);
    // Both keep the address so the ceiling can be applied.
    expect(first.ip).toBe("203.0.113.9");
  });
});

describe("InMemoryRateLimiter with authenticated subjects", () => {
  const policy = (maxRequests: number) => ({
    maxRequests,
    windowMs: 60_000,
    message: "slow down",
  });

  it("meters each account separately behind one shared address", async () => {
    vi.stubEnv("VERCEL", "1");
    const limiter = new InMemoryRateLimiter(policy(2));
    const as = (sub: string) =>
      requestWith({
        "x-vercel-forwarded-for": "203.0.113.9",
        authorization: `Bearer ${fakeToken({ sub })}`,
      });

    // Two requests each is the whole per-account budget, and neither account
    // spends the other's: the old code gave this address one shared 2-request
    // budget and the second account's first call was already a 429.
    expect((await limiter.record(as("userOne"))).ok).toBe(true);
    expect((await limiter.record(as("userOne"))).ok).toBe(true);
    expect((await limiter.record(as("userOne"))).ok).toBe(false);
    expect((await limiter.record(as("userTwo"))).ok).toBe(true);
  });

  it("still bounds a caller who invents a subject per request", async () => {
    vi.stubEnv("VERCEL", "1");
    const limiter = new InMemoryRateLimiter(policy(1));
    const rotating = (index: number) =>
      requestWith({
        "x-vercel-forwarded-for": "203.0.113.9",
        authorization: `Bearer ${fakeToken({ sub: `forged${index}` })}`,
      });

    const ceiling = 1 * TOKEN_IP_CEILING_MULTIPLIER;
    for (let index = 0; index < ceiling; index += 1) {
      expect((await limiter.record(rotating(index))).ok).toBe(true);
    }

    const blocked = await limiter.record(rotating(ceiling));
    expect(blocked.ok).toBe(false);
    expect(blocked.limit).toBe(ceiling);
  });
});
