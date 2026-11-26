import { describe, expect, it } from "vitest";

import { projectUserProfile } from "./userProfile";

describe("projectUserProfile", () => {
  it("keeps only public MFA state", () => {
    const profile = projectUserProfile({
      displayName: "Ada",
      email: "ada@example.com",
      phone: "+44",
      mfa: {
        required: true,
        totp: {
          enabled: true,
          secret: "JBSWY3DPEHPK3PXP",
          backupCodes: ["hash-1"],
          lastTotpCodeHash: "hash-2",
          lastTotpVerifiedAt: 1,
          lastBackupCodeUsedAt: 2,
        },
        sms: { enabled: true, phoneNumber: "+44 7700 900000" },
      },
    });

    expect(profile.mfa).toEqual({
      required: true,
      totp: { enabled: true },
      sms: { enabled: true, phoneNumber: "+44 7700 900000" },
    });
    expect(JSON.stringify(profile)).not.toContain("JBSWY3DPEHPK3PXP");
    expect(JSON.stringify(profile)).not.toContain("hash-1");
  });

  it("omits fields it does not know about", () => {
    const profile = projectUserProfile({
      displayName: "Ada",
      email: "ada@example.com",
      phone: "",
      internalNote: "do not expose",
      role: "superuser",
    });

    expect(profile).toEqual({
      displayName: "Ada",
      email: "ada@example.com",
      phone: "",
    });
  });
});
