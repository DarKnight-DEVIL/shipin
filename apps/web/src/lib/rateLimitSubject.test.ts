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
  UNIDENTIFIED_SUBJECT,
  rateLimitSubject,
  resetRateLimitSubjectCacheForTests,
  resolveRateLimitSubject,
  setBearerVerifierForTests,
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

  it("gives each verified account its own bucket", async () => {
    vi.stubEnv("VERCEL", "1");
    const shared = { "x-vercel-forwarded-for": "203.0.113.9" };
    // A token is base64url, so the sub is read the way a verifier would.
    const verify = async (token: string) => {
      const [, payload] = token.split(".");
      const decoded = JSON.parse(
        Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
      ) as { sub?: string };
      return decoded.sub ?? null;
    };

    const first = await resolveRateLimitSubject(
      requestWith({
        ...shared,
        authorization: `Bearer ${fakeToken({ sub: "userOne" })}`,
      }),
      verify
    );
    const second = await resolveRateLimitSubject(
      requestWith({
        ...shared,
        authorization: `Bearer ${fakeToken({ sub: "userTwo" })}`,
      }),
      verify
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
  setBearerVerifierForTests(async (token) => {
    const [, payload] = token.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { sub?: string };
    return decoded.sub ?? null;
  });
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

  it("gives an unverifiable token the address budget, not a budget of its own", async () => {
    vi.stubEnv("VERCEL", "1");
    // The verifier refuses every token, as Firebase would for a forged one.
    setBearerVerifierForTests(async () => null);

    const limiter = new InMemoryRateLimiter(policy(1));
    const rotating = (index: number) =>
      requestWith({
        "x-vercel-forwarded-for": "203.0.113.9",
        authorization: `Bearer ${fakeToken({ sub: `forged${index}` })}`,
      });

    expect((await limiter.record(rotating(0))).ok).toBe(true);

    // Before verification, each invented subject opened a fresh account bucket
    // and only the 10x address ceiling bounded it. Now the first invented
    // subject is just the address, and the second request is refused.
    const blocked = await limiter.record(rotating(1));
    expect(blocked.ok).toBe(false);
    expect(blocked.limit).toBe(1);
  });

  it("does not let a verified account reset its budget by changing address", async () => {
    vi.stubEnv("VERCEL", "1");
    setBearerVerifierForTests(async () => "userOne");

    const limiter = new InMemoryRateLimiter(policy(2));
    const fromAddress = (address: string) =>
      requestWith({
        "x-vercel-forwarded-for": address,
        authorization: `Bearer ${fakeToken({ sub: "userOne" })}`,
      });

    // The complaint this guards: a compromised account rotating addresses. The
    // bucket belongs to the account, so a new address is the same budget.
    expect((await limiter.record(fromAddress("203.0.113.9"))).ok).toBe(true);
    expect((await limiter.record(fromAddress("198.51.100.7"))).ok).toBe(true);
    expect((await limiter.record(fromAddress("192.0.2.55"))).ok).toBe(false);
  });

  it("verifies a token once, then reuses the identity", async () => {
    vi.stubEnv("VERCEL", "1");
    const verify = vi.fn(async () => "userOne");
    resetRateLimitSubjectCacheForTests();

    const request = () =>
      requestWith({
        "x-vercel-forwarded-for": "203.0.113.9",
        authorization: `Bearer ${fakeToken({ sub: "userOne" })}`,
      });

    await resolveRateLimitSubject(request(), verify);
    await resolveRateLimitSubject(request(), verify);

    // The proxy sees every request; a signature check per request would be cost
    // without extra safety while the token is still valid.
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
