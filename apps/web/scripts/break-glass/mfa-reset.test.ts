import { describe, it, expect, vi } from "vitest";

import { applyReset, inspect, type ResetDeps } from "./mfa-reset";

/**
 * The point of this script is that it is the *only* way back in when the last
 * admin cannot pass the gate, so the tests are mostly about the ways it must
 * refuse: the wrong account, a typo in `--confirm`, no stated reason.
 */
function deps(
  overrides: Partial<ResetDeps> = {},
  doc: Record<string, unknown> = {}
) {
  const calls = {
    clearAuthFactors: vi.fn(async () => {}),
    clearFirestoreFields: vi.fn(async () => {}),
    revokeRefreshTokens: vi.fn(async () => {}),
    writeAudit: vi.fn(async () => {}),
  };

  const base: ResetDeps = {
    getUserByEmail: async (email) => ({ uid: "admin-1", email }),
    getUser: async () => ({ multiFactor: { enrolledFactors: [{}, {}] } }),
    readUserDoc: async () => ({
      role: "admin",
      mfa: { webauthn: [{ id: "k" }] },
      ...doc,
    }),
    countOtherAdminsWithMfa: async () => 0,
    ...calls,
    ...overrides,
  };

  return { deps: base, calls };
}

describe("inspect", () => {
  it("reports the account, its factors and whether anyone else could have helped", async () => {
    const { deps: d } = deps({ countOtherAdminsWithMfa: async () => 2 });

    const result = await inspect("admin@example.com", d);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.uid).toBe("admin-1");
    expect(result.state.enrolledFactors).toBe(2);
    expect(result.state.mfaFields).toEqual(["mfa.webauthn"]);
    expect(result.state.otherAdminsWithMfa).toBe(2);
  });

  it("lists only the factor fields that are actually present", async () => {
    const { deps: d } = deps(
      {},
      { mfa: { totp: { secret: "s" }, sms: { phone: "+1" } } }
    );

    const result = await inspect("admin@example.com", d);

    expect(result.ok && result.state.mfaFields).toEqual([
      "mfa.totp",
      "mfa.sms",
    ]);
  });

  it("refuses a customer, who already has an audited support path", async () => {
    const { deps: d } = deps({}, { role: "customer" });

    const result = await inspect("someone@example.com", d);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("not an admin");
  });

  it("refuses an address that does not exist", async () => {
    const { deps: d } = deps({
      getUserByEmail: async () => {
        throw new Error("auth/user-not-found");
      },
    });

    const result = await inspect("ghost@example.com", d);

    expect(result.ok).toBe(false);
  });

  it("treats a missing user document as non-admin rather than assuming the best", async () => {
    const { deps: d } = deps({ readUserDoc: async () => undefined });

    const result = await inspect("orphan@example.com", d);

    expect(result.ok).toBe(false);
  });
});

describe("applyReset", () => {
  it("writes nothing on a dry run", async () => {
    const { deps: d, calls } = deps();

    const result = await applyReset(
      "admin@example.com",
      undefined,
      "key lost",
      d
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Dry run");
    expect(calls.clearAuthFactors).not.toHaveBeenCalled();
    expect(calls.clearFirestoreFields).not.toHaveBeenCalled();
    expect(calls.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(calls.writeAudit).not.toHaveBeenCalled();
  });

  it("writes nothing when --confirm does not match the account", async () => {
    const { deps: d, calls } = deps();

    const result = await applyReset(
      "admin@example.com",
      "other@example.com",
      "key lost",
      d
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("does not match");
    expect(calls.clearFirestoreFields).not.toHaveBeenCalled();
  });

  it("writes nothing without a reason, so the audit entry is never blank", async () => {
    const { deps: d, calls } = deps();

    const result = await applyReset(
      "admin@example.com",
      "admin@example.com",
      "  ",
      d
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("--reason");
    expect(calls.writeAudit).not.toHaveBeenCalled();
  });

  it("clears both factor stores, kills refresh tokens and records who did it", async () => {
    const { deps: d, calls } = deps();

    const result = await applyReset(
      "Admin@Example.com",
      "admin@example.com",
      "  security key lost  ",
      d
    );

    expect(result.ok).toBe(true);
    expect(calls.clearAuthFactors).toHaveBeenCalledWith("admin-1");
    expect(calls.clearFirestoreFields).toHaveBeenCalledWith(
      "admin-1",
      "break-glass"
    );
    expect(calls.revokeRefreshTokens).toHaveBeenCalledWith("admin-1");
    expect(calls.writeAudit).toHaveBeenCalledWith({
      actorUid: "break-glass-script",
      actorEmail: null,
      action: "mfa.break_glass_reset",
      targetType: "user",
      targetId: "admin-1",
      reason: "security key lost",
    });
  });

  it("matches --confirm case-insensitively, because email addresses are", async () => {
    const { deps: d, calls } = deps();

    const result = await applyReset(
      "admin@example.com",
      "ADMIN@example.COM",
      "key lost",
      d
    );

    expect(result.ok).toBe(true);
    expect(calls.revokeRefreshTokens).toHaveBeenCalled();
  });

  it("does not touch anything if the account turns out not to be an admin", async () => {
    const { deps: d, calls } = deps({}, { role: "customer" });

    const result = await applyReset(
      "someone@example.com",
      "someone@example.com",
      "key lost",
      d
    );

    expect(result.ok).toBe(false);
    expect(calls.clearAuthFactors).not.toHaveBeenCalled();
    expect(calls.revokeRefreshTokens).not.toHaveBeenCalled();
  });
});
