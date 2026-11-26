// @vitest-environment node

/**
 * The permanent verification link.
 *
 * What matters is the trade: the link must keep working indefinitely, and it must stop
 * working the moment it has been used or the account's address changes. Both halves are
 * tested here, because a token that is merely hard to guess but reusable forever would
 * be a hole, and one that expires would defeat the point of the change.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generateVerificationSecret,
  issueVerificationToken,
  parseVerificationToken,
  verificationLink,
  verificationSecret,
  verificationTokenMatches,
  verificationVersion,
} from "./emailVerificationTokens";

const SECRET = "a".repeat(48);

const input = {
  uid: "uid-abc123",
  email: "customer@example.com",
  version: 0,
  secret: SECRET,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("emailVerificationTokens", () => {
  it("accepts the token it issued", () => {
    const token = issueVerificationToken(input);
    const parsed = parseVerificationToken(token);

    expect(parsed).not.toBeNull();
    expect(parsed?.uid).toBe("uid-abc123");
    expect(
      verificationTokenMatches(input, parsed?.signature ?? "")
    ).toBe(true);
  });

  it("does not expire: there is no timestamp anywhere in the scheme", () => {
    const token = issueVerificationToken(input);

    // Same inputs, same token, whenever it is asked for - a year later included. This
    // is the property the whole change exists for, so it is pinned rather than implied.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(issueVerificationToken(input)).toBe(token);
    vi.useRealTimers();
  });

  it("stops accepting a token once the version moves on", () => {
    const token = issueVerificationToken(input);
    const parsed = parseVerificationToken(token);

    expect(
      verificationTokenMatches(
        { ...input, version: 1 },
        parsed?.signature ?? ""
      )
    ).toBe(false);
  });

  it("stops accepting a token issued for a different address", () => {
    const token = issueVerificationToken(input);
    const parsed = parseVerificationToken(token);

    // An address change retires every link that was sent to the old one.
    expect(
      verificationTokenMatches(
        { ...input, email: "someone-else@example.com" },
        parsed?.signature ?? ""
      )
    ).toBe(false);
  });

  it("ignores case and padding in the address", () => {
    const token = issueVerificationToken(input);
    const parsed = parseVerificationToken(token);

    expect(
      verificationTokenMatches(
        { ...input, email: " Customer@Example.COM " },
        parsed?.signature ?? ""
      )
    ).toBe(true);
  });

  it("rejects a token signed with another secret", () => {
    const token = issueVerificationToken({ ...input, secret: "b".repeat(48) });
    const parsed = parseVerificationToken(token);

    expect(
      verificationTokenMatches(input, parsed?.signature ?? "")
    ).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    for (const bad of [
      "",
      "no-separator-here",
      ".leading",
      "trailing.",
      "uid with spaces.abc",
      "uid-abc123.!!!not-base64!!!",
      "uid-abc123.short",
    ]) {
      const parsed = parseVerificationToken(bad);
      // Either it cannot be split, or the signature cannot match.
      expect(parsed === null || !verificationTokenMatches(input, parsed.signature)).toBe(
        true
      );
    }
  });

  it("only hands out a secret when one is long enough to be worth having", () => {
    vi.stubEnv("EMAIL_VERIFICATION_SECRET", "short");
    vi.stubEnv("MFA_SESSION_SECRET", "");
    expect(verificationSecret()).toBeNull();

    // Falls back to the secret production already requires, so a deployment that has
    // not added the new variable still gets permanent links.
    // A dedicated secret that is set but too short is not quietly replaced by
    // another purpose's secret: the deployment said what it wanted, and it is wrong.
    vi.stubEnv("EMAIL_VERIFICATION_SECRET", "");
    vi.stubEnv("MFA_SESSION_SECRET", SECRET);
    expect(verificationSecret()).toBe(SECRET);

    vi.stubEnv("EMAIL_VERIFICATION_SECRET", "c".repeat(40));
    expect(verificationSecret()).toBe("c".repeat(40));
  });

  it("reads a fresh secret for every environment", () => {
    expect(generateVerificationSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateVerificationSecret()).not.toBe(generateVerificationSecret());
  });

  it("builds an absolute link with a URL-safe token", () => {
    const link = verificationLink("https://shipin.example/", "uid-abc.SIG+/=");

    expect(link.startsWith("https://shipin.example/verify-email?token=")).toBe(true);
    expect(link).not.toContain("+/=");
  });

  it("treats a missing or nonsensical version as zero", () => {
    expect(verificationVersion(undefined)).toBe(0);
    expect(verificationVersion(null)).toBe(0);
    expect(verificationVersion("2")).toBe(0);
    expect(verificationVersion(-1)).toBe(0);
    expect(verificationVersion(1.5)).toBe(0);
    expect(verificationVersion(3)).toBe(3);
  });
});
