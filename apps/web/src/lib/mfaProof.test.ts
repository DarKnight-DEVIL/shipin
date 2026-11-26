import crypto from "crypto";
import { describe, expect, it } from "vitest";

import { generateBackupCodes, generateTotpSecret, hashBackupCode } from "./mfa";
import {
  availableMfaMethods,
  hasAnyMfaMethod,
  verifyMfaProof,
  type MfaProfile,
} from "./mfaProof";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Minimal base32 decode, mirroring the TOTP secret encoding. */
function base32Decode(value: string): Buffer {
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];

  for (const char of value.replace(/=/g, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** RFC 6238 TOTP code for a given time (test helper, not production code). */
function totpAt(secret: string, timeMs: number): string {
  const counter = Math.floor(timeMs / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter), 0);

  const digest = crypto
    .createHmac("sha1", base32Decode(secret))
    .update(buffer)
    .digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

function totpProfile(secret: string, withBackup = false): MfaProfile {
  return {
    mfa: {
      totp: {
        enabled: true,
        secret,
        backupCodes: withBackup ? [hashBackupCode("AAAA-BBBB")] : [],
      },
    },
  };
}

describe("availableMfaMethods / hasAnyMfaMethod", () => {
  it("reports nothing for a profile without MFA", () => {
    expect(availableMfaMethods(null)).toEqual([]);
    expect(availableMfaMethods({})).toEqual([]);
    expect(hasAnyMfaMethod({})).toBe(false);
  });

  it("lists TOTP and backup codes", () => {
    const profile: MfaProfile = {
      mfa: {
        totp: { enabled: true, secret: "SECRET", backupCodes: ["hash"] },
      },
    };

    expect(availableMfaMethods(profile)).toEqual(["totp", "backup"]);
  });

  it("does not count a leftover security-key record as a second factor", () => {
    /*
     * Security keys are no longer offered. An account that held one has nothing this
     * build can verify, so it must be told to enrol an authenticator app instead of
     * being sent to a form that cannot complete.
     */
    const profile = {
      mfa: {
        webauthn: {
          enabled: true,
          credentials: [
            {
              credentialID: "cred-1",
              publicKey: "pk-1",
              counter: 0,
              transports: [],
              name: "key",
              createdAt: Date.now(),
            },
          ],
        },
      },
    } as unknown as MfaProfile;

    expect(availableMfaMethods(profile)).toEqual([]);
    expect(hasAnyMfaMethod(profile)).toBe(false);
    expect(verifyMfaProof(profile, { totp: "123456" })).toEqual({
      ok: false,
      reason: "NO_MFA_CONFIGURED",
    });
  });
});

describe("verifyMfaProof — TOTP", () => {
  it("accepts a current code", () => {
    const secret = generateTotpSecret();
    const code = totpAt(secret, Date.now());
    const result = verifyMfaProof(totpProfile(secret, true), { totp: code });

    expect(result).toEqual({ ok: true, method: "totp" });
  });

  it("accepts the previous step to tolerate clock drift", () => {
    const secret = generateTotpSecret();
    const code = totpAt(secret, Date.now() - 30_000);

    expect(verifyMfaProof(totpProfile(secret, true), { totp: code }).ok).toBe(
      true
    );
  });

  it("rejects a wrong code", () => {
    const secret = generateTotpSecret();
    const result = verifyMfaProof(totpProfile(secret), { totp: "000000" });

    expect(result).toEqual({ ok: false, reason: "INVALID_CODE" });
  });

  it("rejects a code when TOTP is not enabled", () => {
    const result = verifyMfaProof(
      { mfa: { totp: { enabled: false, secret: "SECRET", backupCodes: [] } } },
      { totp: "123456" }
    );

    expect(result).toEqual({ ok: false, reason: "NO_MFA_CONFIGURED" });
  });
});

describe("verifyMfaProof — backup codes", () => {
  it("accepts a stored backup code", () => {
    const [plain] = generateBackupCodes(3);
    const profile: MfaProfile = {
      mfa: {
        totp: {
          enabled: true,
          secret: "",
          backupCodes: [hashBackupCode(plain)],
        },
      },
    };

    expect(verifyMfaProof(profile, { backup: plain })).toEqual({
      ok: true,
      method: "backup",
    });
  });

  it("rejects an unknown backup code", () => {
    const profile: MfaProfile = {
      mfa: {
        totp: {
          enabled: true,
          secret: "",
          backupCodes: [hashBackupCode("AAAA-BBBB")],
        },
      },
    };

    expect(verifyMfaProof(profile, { backup: "CCCC-DDDD" }).ok).toBe(false);
  });
});

describe("verifyMfaProof — method precedence and empty input", () => {
  it("prefers a valid TOTP code over an invalid backup code", () => {
    const secret = generateTotpSecret();
    const profile: MfaProfile = {
      mfa: {
        totp: {
          enabled: true,
          secret,
          backupCodes: [hashBackupCode("AAAA-BBBB")],
        },
      },
    };

    const result = verifyMfaProof(profile, {
      totp: totpAt(secret, Date.now()),
      backup: "WRONG-CODE",
    });

    expect(result).toMatchObject({ ok: true, method: "totp" });
  });

  it("reports NO_MFA_CONFIGURED when nothing is enrolled", () => {
    expect(verifyMfaProof({}, {})).toEqual({
      ok: false,
      reason: "NO_MFA_CONFIGURED",
    });
  });

  it("reports INVALID_CODE when methods exist but no proof was given", () => {
    const profile = totpProfile(generateTotpSecret(), true);

    // The profile has TOTP enabled with a secret and backupCodes, so it counts as
    // having MFA configured, but without a proof it should return INVALID_CODE.
    expect(verifyMfaProof(profile, {})).toEqual({
      ok: false,
      reason: "INVALID_CODE",
    });
  });

  it("treats whitespace-only codes as absent", () => {
    const profile = totpProfile(generateTotpSecret());

    expect(verifyMfaProof(profile, { totp: "   " })).toEqual({
      ok: false,
      reason: "INVALID_CODE",
    });
  });
});
