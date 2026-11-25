/**
 * Shared client for the MFA endpoints.
 *
 * Every call is same-origin, authenticated with the caller's Firebase ID
 * token, and never cached. Errors are normalized into `MfaApiError` so the UI
 * can branch on `code` instead of parsing messages.
 *
 * The App Check token is attached here too. These routes are behind the same
 * customer gate as every other `/api` call, so without it the request is
 * refused before any MFA logic runs - with enforcement on, the admin gate's own
 * status request, TOTP setup, security-key ceremonies and SMS enrolment all
 * failed as "App verification failed", and nothing in the UI could say why.
 *
 * `lib/apiClient.ts` is the only other client that talks to these routes and it
 * already sends the header; this module was written separately and missed it.
 */

import { getAppCheckToken } from "@/lib/firebase";

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
  /** The request was refused before MFA was read: no valid App Check token. */
  | "APP_CHECK_FAILED"
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

  const send = (appCheckToken: string | null) =>
    fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });

  try {
    response = await send(await getAppCheckToken());
  } catch {
    throw new MfaApiError("Could not reach the server.", "NETWORK_ERROR");
  }

  let payload: Record<string, unknown> = {};

  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  // One replay with a freshly minted token: a cached one can be stale in a
  // long-lived tab, and the rejection means the handler never ran, so replaying
  // is free of side effects. Deliberately not a loop.
  if (!response.ok && payload.code === "APP_CHECK_FAILED") {
    const refreshed = await getAppCheckToken(true);

    if (refreshed) {
      try {
        response = await send(refreshed);
      } catch {
        throw new MfaApiError("Could not reach the server.", "NETWORK_ERROR");
      }

      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
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
