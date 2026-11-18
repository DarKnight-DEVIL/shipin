import { beforeEach, describe, expect, it, vi } from "vitest";

const denylist = vi.hoisted(() => ({
  isMfaSessionDenied: vi.fn(),
  denyMfaSession: vi.fn(),
}));

// The revocation list talks to Redis; these tests are about how its answer is
// used, so it is stubbed and its calls asserted.
vi.mock("./mfaDenylist", () => ({
  isMfaSessionDenied: denylist.isMfaSessionDenied,
  denyMfaSession: denylist.denyMfaSession,
}));

/**
 * Imported per file, after `vi.resetModules()`, exactly like
 * `apiClient.test.ts`. With `isolate: false` the module registry is shared
 * between test files, so a static import here can bind whichever
 * `./mfaDenylist` mock another file registered first — which made these tests
 * pass alone and fail under `--sequence.shuffle`, with the real Redis-backed
 * denylist answering instead of the stub.
 */
let mfa!: typeof import("./mfaSession");

const UID = "admin-uid-123";

beforeEach(async () => {
  vi.resetModules();
  mfa = await import("./mfaSession");
  denylist.isMfaSessionDenied.mockReset().mockResolvedValue(false);
  denylist.denyMfaSession.mockReset().mockResolvedValue(undefined);
});

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
    const { token, expiresAt, jti } = mfa.createMfaSessionToken(UID);
    const session = mfa.verifyMfaSessionToken(token);

    expect(session).not.toBeNull();
    expect(session?.uid).toBe(UID);
    expect(session?.expiresAt).toBe(expiresAt);
    expect(session?.jti).toBe(jti);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("gives every session its own id", () => {
    // Revoking one admin session must not touch the same account's others.
    const first = mfa.createMfaSessionToken(UID);
    const second = mfa.createMfaSessionToken(UID);

    expect(first.jti).not.toBe(second.jti);
    expect(mfa.verifyMfaSessionToken(first.token)?.jti).toBe(first.jti);
    expect(mfa.verifyMfaSessionToken(second.token)?.jti).toBe(second.jti);
  });

  it("expires exactly at the configured TTL", () => {
    const now = Date.now();
    const { expiresAt } = mfa.createMfaSessionToken(UID, now);

    expect(expiresAt).toBe(
      Math.floor(now / 1000) + mfa.MFA_SESSION_TTL_MS / 1000
    );
  });

  it("rejects an expired token", () => {
    const issued = Date.now() - mfa.MFA_SESSION_TTL_MS - 5_000;
    const { token } = mfa.createMfaSessionToken(UID, issued);

    expect(mfa.verifyMfaSessionToken(token)).toBeNull();
  });

  it("rejects a token issued too far in the future", () => {
    const issued = Date.now() + 10 * 60 * 1000;
    const { token } = mfa.createMfaSessionToken(UID, issued);

    expect(mfa.verifyMfaSessionToken(token)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { token } = mfa.createMfaSessionToken(UID);
    const lastChar = token.slice(-1) === "A" ? "B" : "A";
    const tampered = token.slice(0, -1) + lastChar;

    expect(mfa.verifyMfaSessionToken(tampered)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const { token } = mfa.createMfaSessionToken(UID);
    const [encoded, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      Buffer.from(encoded, "base64url")
        .toString("utf8")
        .replace(UID, "someone-else"),
      "utf8"
    ).toString("base64url");

    expect(
      mfa.verifyMfaSessionToken(`${forgedPayload}.${signature}`)
    ).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(mfa.verifyMfaSessionToken(null)).toBeNull();
    expect(mfa.verifyMfaSessionToken("")).toBeNull();
    expect(mfa.verifyMfaSessionToken("no-separator")).toBeNull();
    expect(mfa.verifyMfaSessionToken("abc.")).toBeNull();
  });
});

describe("cookie helpers", () => {
  it("sets an HttpOnly, strict, 30 minute cookie", () => {
    const header = mfa.createMfaSessionCookieHeader("token-value");

    expect(header).toContain(`${mfa.MFA_SESSION_COOKIE}=token-value`);
    expect(header).toContain("HttpOnly");
    expect(header.toLowerCase()).toContain("samesite=strict");
    expect(header).toContain("Path=/");
    expect(header).toContain(`Max-Age=${mfa.MFA_SESSION_TTL_MS / 1000}`);
  });

  it("clears the cookie with Max-Age=0", () => {
    const header = mfa.clearMfaSessionCookieHeader();

    expect(header).toContain(`${mfa.MFA_SESSION_COOKIE}=`);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("reads a cookie out of a multi-cookie header", () => {
    const request = requestWithCookie(
      `theme=dark; ${mfa.MFA_SESSION_COOKIE}=abc.def; other=1`
    );

    expect(mfa.readRequestCookie(request, mfa.MFA_SESSION_COOKIE)).toBe(
      "abc.def"
    );
    expect(mfa.readRequestCookie(request, "missing")).toBeNull();
    expect(
      mfa.readRequestCookie(requestWithCookie(""), mfa.MFA_SESSION_COOKIE)
    ).toBeNull();
  });

  it("extracts a verifying session from a request", async () => {
    const { token, jti } = mfa.createMfaSessionToken(UID);
    const request = requestWithCookie(`${mfa.MFA_SESSION_COOKIE}=${token}`);

    await expect(mfa.getMfaSession(request)).resolves.toMatchObject({
      uid: UID,
      jti,
    });
    expect(denylist.isMfaSessionDenied).toHaveBeenCalledWith(jti);
  });

  it("ignores an invalid session cookie without consulting the denylist", async () => {
    const request = requestWithCookie(`${mfa.MFA_SESSION_COOKIE}=not-a-token`);

    await expect(mfa.getMfaSession(request)).resolves.toBeNull();
    // An unverifiable token never reaches the store.
    expect(denylist.isMfaSessionDenied).not.toHaveBeenCalled();
  });

  it("rejects a session that was revoked server-side", async () => {
    const { token } = mfa.createMfaSessionToken(UID);
    const request = requestWithCookie(`${mfa.MFA_SESSION_COOKIE}=${token}`);
    denylist.isMfaSessionDenied.mockResolvedValue(true);

    // Same signature, same claims: only the denylist can tell that the admin
    // signed out elsewhere and this token was copied.
    await expect(mfa.getMfaSession(request)).resolves.toBeNull();
  });

  it("revokes by session id for the rest of its lifetime", async () => {
    const { token, expiresAt, jti } = mfa.createMfaSessionToken(UID);
    const session = mfa.verifyMfaSessionToken(token)!;

    await mfa.revokeMfaSession(session);

    expect(denylist.denyMfaSession).toHaveBeenCalledWith(jti, expiresAt);
  });
});

describe("parseMfaSessionPayload", () => {
  const now = 2_000_000_000_000;
  const issued = Math.floor(now / 1000);

  it("accepts a current payload", () => {
    expect(
      mfa.parseMfaSessionPayload(
        `2.${UID}.${issued}.${issued + 900}.jti-1`,
        now
      )
    ).toEqual({
      uid: UID,
      expiresAt: issued + 900,
      jti: "jti-1",
    });
  });

  it("rejects version 1 tokens, which have no session id", () => {
    // Those cookies shipped before revocation existed, so honouring them would
    // leave a 30-minute window that nothing can close.
    expect(
      mfa.parseMfaSessionPayload(`1.${UID}.${issued}.${issued + 900}`, now)
    ).toBeNull();
  });

  it("rejects a version 2 payload with no jti", () => {
    expect(
      mfa.parseMfaSessionPayload(`2.${UID}.${issued}.${issued + 900}`, now)
    ).toBeNull();
  });
});
