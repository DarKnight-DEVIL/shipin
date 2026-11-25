import { describe, it, expect, vi } from "vitest";

import {
  confirmTotpEnrolment,
  resolveEnrolTarget,
  buildOtpauthUrl,
  stageTotpEnrolment,
  type EnrolDeps,
} from "./mfa-reset";

/**
 * Enrolment is the path for an account whose codes the UI keeps refusing. It is
 * also the only place in this script that creates a factor rather than removing
 * one, so the tests concentrate on the ways it must refuse to do that: an
 * already-working factor, a missing pending secret, a code that does not match.
 */
function enrolDeps(overrides: Partial<EnrolDeps> = {}, doc: Record<string, unknown> = {}) {
  const calls = {
    writePendingSecret: vi.fn(async () => {}),
    enableTotp: vi.fn(async () => {}),
    writeAudit: vi.fn(async () => {}),
  };

  const base: EnrolDeps = {
    getUserByEmail: async (email) => ({ uid: "admin-1", email }),
    readUserDoc: async () => ({ role: "admin", ...doc }),
    generateSecret: () => "JBSWY3DPEHPK3PXP",
    verifyCode: (secret, code) => secret === "JBSWY3DPEHPK3PXP" && code === "123456",
    generateBackupCodes: (count) =>
      Array.from({ length: count }, (_, index) => `CODE-${index}`),
    hashBackupCode: (code) => `hashed:${code}`,
    ...calls,
    ...overrides,
  };

  return { deps: base, calls };
}

describe("buildOtpauthUrl", () => {
  it("uses the parameters the app's QR encodes", () => {
    const url = buildOtpauthUrl("JBSWY3DPEHPK3PXP", "admin@example.com");

    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=ShipIN+Admin");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
    expect(url).toContain("algorithm=SHA1");
  });

  it("escapes an address that would otherwise break the label", () => {
    const url = buildOtpauthUrl("ABC", "a+b@example.com");

    expect(url).toContain("a%2Bb%40example.com");
  });
});

describe("resolveEnrolTarget", () => {
  it("treats a disabled secret as pending", async () => {
    const { deps: d } = enrolDeps(
      {},
      { mfa: { totp: { secret: "PENDING", enabled: false } } }
    );

    const result = await resolveEnrolTarget("admin@example.com", d);

    expect(result.ok && result.target.pendingSecret).toBe("PENDING");
    expect(result.ok && result.target.enabled).toBe(false);
  });

  it("does not treat an enabled secret as pending", async () => {
    const { deps: d } = enrolDeps(
      {},
      { mfa: { totp: { secret: "LIVE", enabled: true, backupCodes: ["a", "b"] } } }
    );

    const result = await resolveEnrolTarget("admin@example.com", d);

    expect(result.ok && result.target.pendingSecret).toBe(null);
    expect(result.ok && result.target.enabled).toBe(true);
    expect(result.ok && result.target.backupCodes).toBe(2);
  });
});

describe("stageTotpEnrolment", () => {
  it("writes a pending secret and hands back a scannable URL", async () => {
    const { deps: d, calls } = enrolDeps();

    const result = await stageTotpEnrolment("admin@example.com", d);

    expect(result.ok).toBe(true);
    expect(calls.writePendingSecret).toHaveBeenCalledWith("admin-1", "JBSWY3DPEHPK3PXP");
    expect(result.otpauthUrl).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(calls.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mfa.break_glass_enrol_staged" })
    );
  });

  it("never replaces a factor that is already working", async () => {
    const { deps: d, calls } = enrolDeps(
      {},
      { mfa: { totp: { secret: "OLD", enabled: true } } }
    );

    const result = await stageTotpEnrolment("admin@example.com", d);

    expect(result.ok).toBe(false);
    expect(calls.writePendingSecret).not.toHaveBeenCalled();
  });

  it("stages over an abandoned pending secret instead of refusing", async () => {
    const { deps: d, calls } = enrolDeps(
      {},
      { mfa: { totp: { secret: "OLD", enabled: false } } }
    );

    const result = await stageTotpEnrolment("admin@example.com", d);

    expect(result.ok).toBe(true);
    expect(calls.writePendingSecret).toHaveBeenCalled();
  });

  it("refuses a non-admin", async () => {
    const { deps: d } = enrolDeps({}, { role: "customer" });

    const result = await stageTotpEnrolment("someone@example.com", d);

    expect(result.ok).toBe(false);
  });

  it("refuses an address that does not exist", async () => {
    const { deps: d } = enrolDeps({
      getUserByEmail: async () => {
        throw new Error("auth/user-not-found");
      },
    });

    const result = await stageTotpEnrolment("ghost@example.com", d);

    expect(result.ok).toBe(false);
  });
});

describe("confirmTotpEnrolment", () => {
  it("refuses without a pending secret, so nothing is enabled blind", async () => {
    const { deps: d, calls } = enrolDeps();

    const result = await confirmTotpEnrolment("admin@example.com", "123456", d);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("--enrol-totp");
    expect(calls.enableTotp).not.toHaveBeenCalled();
  });

  it("refuses a code that does not match, leaving the factor disabled", async () => {
    const { deps: d, calls } = enrolDeps(
      {},
      { mfa: { totp: { secret: "JBSWY3DPEHPK3PXP", enabled: false } } }
    );

    const result = await confirmTotpEnrolment("admin@example.com", "000000", d);

    expect(result.ok).toBe(false);
    expect(calls.enableTotp).not.toHaveBeenCalled();
    expect(calls.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric code before asking otplib", async () => {
    const verify = vi.fn(() => true);
    const { deps: d } = enrolDeps(
      { verifyCode: verify },
      { mfa: { totp: { secret: "S", enabled: false } } }
    );

    const result = await confirmTotpEnrolment("admin@example.com", "12ab56", d);

    expect(result.ok).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });

  it("enables the factor and issues backup codes once the code verifies", async () => {
    const { deps: d, calls } = enrolDeps(
      {},
      { mfa: { totp: { secret: "JBSWY3DPEHPK3PXP", enabled: false } } }
    );

    const result = await confirmTotpEnrolment("admin@example.com", " 123456 ", d);

    expect(result.ok).toBe(true);
    expect(calls.enableTotp).toHaveBeenCalledWith(
      "admin-1",
      "JBSWY3DPEHPK3PXP",
      expect.any(Array)
    );
    expect(result.backupCodes).toHaveLength(10);
    expect(calls.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mfa.break_glass_enrol_confirmed" })
    );
  });
});
