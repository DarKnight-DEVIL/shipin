import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildUnsubscribeHeaders,
  createUnsubscribeToken,
  createUnsubscribeUrl,
  verifyUnsubscribeToken,
} from "./unsubscribeToken";

const SECRET = "test-unsubscribe-secret-0123456789";
const saved = {
  MFA_SESSION_SECRET: process.env.MFA_SESSION_SECRET,
  UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET,
};

beforeEach(() => {
  process.env.MFA_SESSION_SECRET = SECRET;
  delete process.env.UNSUBSCRIBE_SECRET;
});

afterEach(() => {
  process.env.MFA_SESSION_SECRET = saved.MFA_SESSION_SECRET;
  if (saved.UNSUBSCRIBE_SECRET === undefined) {
    delete process.env.UNSUBSCRIBE_SECRET;
  } else {
    process.env.UNSUBSCRIBE_SECRET = saved.UNSUBSCRIBE_SECRET;
  }
});

describe("unsubscribe tokens", () => {
  it("verifies a token for the same user and rejects it for another", () => {
    const token = createUnsubscribeToken("user-a");

    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken("user-a", token!)).toBe(true);
    expect(verifyUnsubscribeToken("user-b", token!)).toBe(false);
  });

  it("rejects tampered and empty tokens", () => {
    const token = createUnsubscribeToken("user-a")!;

    expect(verifyUnsubscribeToken("user-a", `${token}x`)).toBe(false);
    expect(verifyUnsubscribeToken("user-a", "")).toBe(false);
    expect(verifyUnsubscribeToken("user-a", token.slice(0, -1))).toBe(false);
  });

  it("changes the signature when the secret changes", () => {
    const first = createUnsubscribeToken("user-a");
    process.env.MFA_SESSION_SECRET = `${SECRET}-rotated`;

    expect(createUnsubscribeToken("user-a")).not.toBe(first);
    expect(verifyUnsubscribeToken("user-a", first!)).toBe(false);
  });

  it("returns null instead of a weak signature when no secret is configured", () => {
    delete process.env.MFA_SESSION_SECRET;

    expect(createUnsubscribeToken("user-a")).toBeNull();
    expect(createUnsubscribeUrl("user-a")).toBeNull();
    expect(verifyUnsubscribeToken("user-a", "anything")).toBe(false);
  });

  it("prefers UNSUBSCRIBE_SECRET when it is set", () => {
    process.env.UNSUBSCRIBE_SECRET = "a-different-long-secret-value";
    const withOverride = createUnsubscribeToken("user-a");
    delete process.env.UNSUBSCRIBE_SECRET;

    expect(withOverride).not.toBe(createUnsubscribeToken("user-a"));
  });

  it("builds an absolute URL and RFC 8058 headers", () => {
    const url = createUnsubscribeUrl("user-a");

    expect(url).toMatch(
      /^https:\/\/.+\/api\/notifications\/unsubscribe\?uid=user-a&token=.+$/
    );
    expect(buildUnsubscribeHeaders(url!)).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
