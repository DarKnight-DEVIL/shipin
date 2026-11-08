/**
 * Shared client for the MFA endpoints.
 *
 * Every call is same-origin, authenticated with the caller's Firebase ID
 * token, and never cached. Errors are normalized into `MfaApiError` so the UI
 * can branch on `code` instead of parsing messages.
 */

export type MfaApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_AUTHENTICATION"
  | "USER_PROFILE_NOT_FOUND"
  | "ADMIN_ACCESS_REQUIRED"
  | "MFA_SETUP_REQUIRED"
  | "MFA_INVALID_CODE"
  | "INVALID_TOTP_CODE"
  | "TOTP_NOT_SETUP"
  | "INVALID_PHONE_NUMBER"
  | "INVALID_VERIFICATION_CODE"
  | "SMS_VERIFICATION_NOT_PENDING"
  | "SMS_VERIFICATION_EXPIRED"
  | "SMS_SEND_FAILED"
  | "MFA_CODE_REQUIRED"
  | "INVALID_REQUEST_BODY"
  | "INVALID_CREDENTIAL"
  | "WEBAUTHN_NOT_CONFIGURED"
  | "WEBAUTHN_CHALLENGE_EXPIRED"
  | "WEBAUTHN_INVALID_RESPONSE"
  | "WEBAUTHN_UNKNOWN_CREDENTIAL"
  | "WEBAUTHN_VERIFICATION_FAILED"
  | "WEBAUTHN_CREDENTIAL_EXISTS"
  | "WEBAUTHN_TOO_MANY_CREDENTIALS"
  | "WEBAUTHN_LAST_FACTOR"
  | "RATE_LIMIT_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export class MfaApiError extends Error {
  readonly code: MfaApiErrorCode;
  readonly status: number;

  constructor(message: string, code: MfaApiErrorCode, status = 0) {
    super(message);
    this.name = "MfaApiError";
    this.code = code;
    this.status = status;
  }
}

type MfaApiOptions = {
  idToken: string;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
};

export async function mfaApi<T>(
  path: string,
  { idToken, method = "GET", body }: MfaApiOptions
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new MfaApiError("Could not reach the server.", "NETWORK_ERROR");
  }

  let payload: Record<string, unknown> = {};

  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new MfaApiError(
      typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status}).`,
      (payload.code as MfaApiErrorCode) || "UNKNOWN_ERROR",
      response.status
    );
  }

  return payload as T;
}
