/**
 * Tests for the MFA enrolment client wrappers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ mfaApi: vi.fn() }));

vi.mock("@/lib/mfaApi", () => ({
  mfaApi: mocks.mfaApi,
  MfaApiError: class extends Error {},
}));

import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  getMfaConfigStatus,
  regenerateBackupCodes,
} from "./mfaSetupClient";

beforeEach(() => {
  mocks.mfaApi.mockReset();
});

describe("getMfaConfigStatus", () => {
  it("parses a complete status payload", async () => {
    mocks.mfaApi.mockResolvedValue({
      totp: { enabled: true, pending: false },
      sms: { enabled: true, phoneNumber: "+919876543210" },
      backupCodes: 7,
    });

    await expect(getMfaConfigStatus("token")).resolves.toEqual({
      totp: { enabled: true, pending: false },
      sms: { enabled: true, phoneNumber: "+919876543210" },
      backupCodes: 7,
    });
    expect(mocks.mfaApi).toHaveBeenCalledWith("/api/auth/mfa/status", {
      idToken: "token",
    });
  });

  it("defaults every missing factor", async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(getMfaConfigStatus("token")).resolves.toEqual({
      totp: { enabled: false, pending: false },
      sms: { enabled: false, phoneNumber: null },
      backupCodes: 0,
    });
  });

});

describe("beginTotpEnrollment", () => {
  it("returns the secret, otpauth URI and QR image", async () => {
    mocks.mfaApi.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      qrUrl: "otpauth://totp/ShipIN?secret=JBSWY3DPEHPK3PXP",
      qrDataUrl: "data:image/png;base64,abc",
    });

    await expect(beginTotpEnrollment("token")).resolves.toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      qrUrl: "otpauth://totp/ShipIN?secret=JBSWY3DPEHPK3PXP",
      qrDataUrl: "data:image/png;base64,abc",
    });
    expect(mocks.mfaApi).toHaveBeenCalledWith("/api/auth/mfa/totp/setup", {
      idToken: "token",
      method: "POST",
    });
  });

  it("falls back to empty strings when the server omits values", async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(beginTotpEnrollment("token")).resolves.toEqual({
      secret: "",
      qrUrl: "",
      qrDataUrl: "",
    });
  });
});

describe("backup codes", () => {
  it("returns freshly issued codes on confirm", async () => {
    mocks.mfaApi.mockResolvedValue({ backupCodes: ["a", "b"] });

    await expect(confirmTotpEnrollment("token", "123456")).resolves.toEqual([
      "a",
      "b",
    ]);
    expect(mocks.mfaApi).toHaveBeenCalledWith("/api/auth/mfa/totp/verify", {
      idToken: "token",
      method: "POST",
      body: { code: "123456" },
    });
  });

  it("returns an empty list when codes are absent", async () => {
    mocks.mfaApi.mockResolvedValue({});

    await expect(confirmTotpEnrollment("token", "123456")).resolves.toEqual([]);
  });

  it("regenerates codes using a TOTP code", async () => {
    mocks.mfaApi.mockResolvedValue({ backupCodes: ["c"] });

    await expect(regenerateBackupCodes("token", "654321")).resolves.toEqual([
      "c",
    ]);
    expect(mocks.mfaApi).toHaveBeenCalledWith(
      "/api/auth/mfa/backup-codes/regenerate",
      { idToken: "token", method: "POST", body: { totpCode: "654321" } }
    );
  });
});
