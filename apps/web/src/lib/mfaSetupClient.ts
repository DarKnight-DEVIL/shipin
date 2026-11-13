/**
 * Client wrappers for the MFA enrollment endpoints.
 *
 * These routes were written before the security screen existed; this module is
 * the single place that knows their request/response shapes.
 */

import { mfaApi } from "@/lib/mfaApi";

export interface SecurityKeySummary {
  id: string;
  name: string;
  createdAt: number;
}

export interface MfaConfigStatus {
  totp: { enabled: boolean; pending: boolean };
  sms: { enabled: boolean; phoneNumber: string | null };
  backupCodes: number;
  webauthn: { enabled: boolean; credentials: SecurityKeySummary[] };
}

type StatusResponse = {
  totp?: { enabled?: unknown; pending?: unknown };
  sms?: { enabled?: unknown; phoneNumber?: unknown };
  backupCodes?: unknown;
  webauthn?: { enabled?: unknown; credentials?: unknown };
};

function readSecurityKeys(value: unknown): SecurityKeySummary[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const key = entry as { id?: unknown; name?: unknown; createdAt?: unknown };

    if (typeof key?.id !== "string") return [];

    return [
      {
        id: key.id,
        name: typeof key.name === "string" ? key.name : "Security key",
        createdAt: typeof key.createdAt === "number" ? key.createdAt : 0,
      },
    ];
  });
}

type TotpSetupResponse = {
  secret?: unknown;
  qrUrl?: unknown;
  qrDataUrl?: unknown;
};
type BackupCodesResponse = { backupCodes?: unknown };
type MessageResponse = { message?: unknown };

function readBackupCodes(body: BackupCodesResponse): string[] {
  return Array.isArray(body.backupCodes)
    ? (body.backupCodes as string[])
    : [];
}

/** Which factors are configured for the signed-in admin. */
export async function getMfaConfigStatus(
  idToken: string
): Promise<MfaConfigStatus> {
  const body = await mfaApi<StatusResponse>("/api/auth/mfa/status", {
    idToken,
  });

  return {
    totp: {
      enabled: Boolean(body.totp?.enabled),
      pending: Boolean(body.totp?.pending),
    },
    sms: {
      enabled: Boolean(body.sms?.enabled),
      phoneNumber:
        typeof body.sms?.phoneNumber === "string"
          ? body.sms.phoneNumber
          : null,
    },
    backupCodes:
      typeof body.backupCodes === "number" ? body.backupCodes : 0,
    webauthn: {
      enabled: Boolean(body.webauthn?.enabled),
      credentials: readSecurityKeys(body.webauthn?.credentials),
    },
  };
}

/**
 * Start TOTP enrollment: stores a fresh (unconfirmed) secret and returns it
 * with the `otpauth://` URI plus a server-rendered QR PNG data URL.
 */
export async function beginTotpEnrollment(idToken: string): Promise<{
  secret: string;
  qrUrl: string;
  qrDataUrl: string;
}> {
  const body = await mfaApi<TotpSetupResponse>("/api/auth/mfa/totp/setup", {
    idToken,
    method: "POST",
  });

  return {
    secret: typeof body.secret === "string" ? body.secret : "",
    qrUrl: typeof body.qrUrl === "string" ? body.qrUrl : "",
    qrDataUrl: typeof body.qrDataUrl === "string" ? body.qrDataUrl : "",
  };
}

/**
 * Confirm TOTP with the first code. Enabling TOTP also issues ten new backup
 * codes — they are returned once and never again.
 */
export async function confirmTotpEnrollment(
  idToken: string,
  code: string
): Promise<string[]> {
  const body = await mfaApi<BackupCodesResponse>(
    "/api/auth/mfa/totp/verify",
    { idToken, method: "POST", body: { code } }
  );

  return readBackupCodes(body);
}

/** Replace all backup codes (requires a current TOTP code). */
export async function regenerateBackupCodes(
  idToken: string,
  totpCode: string
): Promise<string[]> {
  const body = await mfaApi<BackupCodesResponse>(
    "/api/auth/mfa/backup-codes/regenerate",
    { idToken, method: "POST", body: { totpCode } }
  );

  return readBackupCodes(body);
}

/** Send an SMS verification code to an E.164 phone number. */
export async function sendSmsCode(
  idToken: string,
  phoneNumber: string
): Promise<string> {
  const body = await mfaApi<MessageResponse>("/api/auth/mfa/sms/setup", {
    idToken,
    method: "POST",
    body: { phoneNumber },
  });

  return typeof body.message === "string" ? body.message : "Code sent.";
}

/** Confirm the SMS code and enable SMS as a second factor. */
export async function confirmSmsCode(
  idToken: string,
  code: string
): Promise<string> {
  const body = await mfaApi<MessageResponse>("/api/auth/mfa/sms/verify", {
    idToken,
    method: "POST",
    body: { code },
  });

  return typeof body.message === "string" ? body.message : "SMS enabled.";
}
