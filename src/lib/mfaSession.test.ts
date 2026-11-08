import { describe, expect, it } from "vitest";

import {
  MFA_SESSION_TTL_MS,
  MFA_SESSION_COOKIE,
  clearMfaSessionCookieHeader,
  createMfaSessionCookieHeader,
  createMfaSessionToken,
  getMfaSession,
  readRequestCookie,
  verifyMfaSessionToken,
} from "./mfaSession";

const UID = "admin-uid-123";

/**
 * Minimal Request stand-in. The DOM Request implementation in the test
 * environment strips the forbidden `cookie` header, so requests are stubbed
 * with just the header reader the module uses.
 */
function requestWithCookie(cookie: string): Request {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "cookie" && cookie !== "" ? cookie : null,
    },
  } as unknown as Request;
}

describe("createMfaSessionToken / verifyMfaSessionToken", () => {
  it("round-trips a valid token", () => {
    const { token, expiresAt } = createMfaSessionToken(UID);
    const session = verifyMfaSessionToken(token);

    expect(session).not.toBeNull();
    expect(session?.uid).toBe(UID);
    expect(session?.expiresAt).toBe(expiresAt);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("expires exactly at the configured TTL", () => {
    const now = Date.now();
    const { expiresAt } = createMfaSessionToken(UID, now);

    expect(expiresAt).toBe(Math.floor(now / 1000) + MFA_SESSION_TTL_MS / 1000);
  });

  it("rejects an expired token", () => {
    const issued = Date.now() - MFA_SESSION_TTL_MS - 5_000;
    const { token } = createMfaSessionToken(UID, issued);

    expect(verifyMfaSessionToken(token)).toBeNull();
  });

  it("rejects a token issued too far in the future", () => {
    const issued = Date.now() + 10 * 60 * 1000;
    const { token } = createMfaSessionToken(UID, issued);

    expect(verifyMfaSessionToken(token)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { token } = createMfaSessionToken(UID);
    const lastChar = token.slice(-1) === "A" ? "B" : "A";
    const tampered = token.slice(0, -1) + lastChar;

    expect(verifyMfaSessionToken(tampered)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const { token } = createMfaSessionToken(UID);
    const [encoded, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      Buffer.from(encoded, "base64url").toString("utf8").replace(UID, "someone-else"),
      "utf8"
    ).toString("base64url");

    expect(verifyMfaSessionToken(`${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyMfaSessionToken(null)).toBeNull();
    expect(verifyMfaSessionToken("")).toBeNull();
    expect(verifyMfaSessionToken("no-separator")).toBeNull();
    expect(verifyMfaSessionToken("abc.")).toBeNull();
  });
});

describe("cookie helpers", () => {
  it("sets an HttpOnly, strict, 30 minute cookie", () => {
    const header = createMfaSessionCookieHeader("token-value");

    expect(header).toContain(`${MFA_SESSION_COOKIE}=token-value`);
    expect(header).toContain("HttpOnly");
    expect(header.toLowerCase()).toContain("samesite=strict");
    expect(header).toContain("Path=/");
    expect(header).toContain(`Max-Age=${MFA_SESSION_TTL_MS / 1000}`);
  });

  it("clears the cookie with Max-Age=0", () => {
    const header = clearMfaSessionCookieHeader();

    expect(header).toContain(`${MFA_SESSION_COOKIE}=`);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("reads a cookie out of a multi-cookie header", () => {
    const request = requestWithCookie(
      `theme=dark; ${MFA_SESSION_COOKIE}=abc.def; other=1`
    );

    expect(readRequestCookie(request, MFA_SESSION_COOKIE)).toBe("abc.def");
    expect(readRequestCookie(request, "missing")).toBeNull();
    expect(readRequestCookie(requestWithCookie(""), MFA_SESSION_COOKIE)).toBeNull();
  });

  it("extracts a verifying session from a request", () => {
    const { token } = createMfaSessionToken(UID);
    const request = requestWithCookie(`${MFA_SESSION_COOKIE}=${token}`);

    expect(getMfaSession(request)?.uid).toBe(UID);
  });

  it("ignores an invalid session cookie", () => {
    const request = requestWithCookie(`${MFA_SESSION_COOKIE}=not-a-token`);

    expect(getMfaSession(request)).toBeNull();
  });
});
