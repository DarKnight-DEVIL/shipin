/**
 * Browser-side WebAuthn ceremonies (passkeys / security keys).
 *
 * The server issues the options and verifies the result; this module only
 * drives `navigator.credentials` through @simplewebauthn/browser and keeps the
 * call sites free of ceremony boilerplate.
 */

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { MfaApiError, mfaApi } from "@/lib/mfaApi";

/** Cancellation and "no matching credential" are normal, not failures. */
export class WebAuthnCeremonyError extends Error {
  readonly cancelled: boolean;

  constructor(message: string, cancelled: boolean) {
    super(message);
    this.name = "WebAuthnCeremonyError";
    this.cancelled = cancelled;
  }
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

function describeCeremonyFailure(error: unknown): WebAuthnCeremonyError {
  const name = (error as { name?: string } | null)?.name ?? "";

  if (name === "NotAllowedError" || name === "AbortError") {
    return new WebAuthnCeremonyError(
      "Security key prompt was cancelled.",
      true
    );
  }

  if (name === "InvalidStateError") {
    return new WebAuthnCeremonyError(
      "This security key is already registered.",
      false
    );
  }

  return new WebAuthnCeremonyError(
    "This security key could not be used. Try again.",
    false
  );
}

type CredentialResponse<T> = { success?: boolean; options?: T };

/** Register a new security key or passkey for the signed-in admin. */
export async function registerSecurityKey(
  idToken: string,
  _name: string
): Promise<RegistrationResponseJSON> {
  const start = await mfaApi<
    CredentialResponse<PublicKeyCredentialCreationOptionsJSON>
  >("/api/auth/mfa/webauthn/register/start", {
    idToken,
    method: "POST",
  });

  if (!start.options) {
    throw new MfaApiError(
      "The server did not return registration options.",
      "UNKNOWN_ERROR"
    );
  }

  try {
    return await startRegistration({ optionsJSON: start.options });
  } catch (error) {
    throw describeCeremonyFailure(error);
  }
}

/** Finish registration after the browser produced a credential. */
export async function completeSecurityKeyRegistration(
  idToken: string,
  credential: RegistrationResponseJSON,
  name: string
): Promise<{ id: string; name: string }> {
  const body = await mfaApi<{
    credential?: { id?: string; name?: string };
  }>("/api/auth/mfa/webauthn/register/complete", {
    idToken,
    method: "POST",
    body: { credential, credentialName: name },
  });

  return {
    id: typeof body.credential?.id === "string" ? body.credential.id : "",
    name: typeof body.credential?.name === "string" ? body.credential.name : name,
  };
}

/** Run the assertion ceremony and return what the server must verify. */
export async function assertSecurityKey(
  idToken: string
): Promise<AuthenticationResponseJSON> {
  const start = await mfaApi<
    CredentialResponse<PublicKeyCredentialRequestOptionsJSON>
  >("/api/auth/mfa/webauthn/verify", { idToken, method: "POST" });

  if (!start.options) {
    throw new MfaApiError(
      "The server did not return verification options.",
      "UNKNOWN_ERROR"
    );
  }

  try {
    return await startAuthentication({ optionsJSON: start.options });
  } catch (error) {
    throw describeCeremonyFailure(error);
  }
}

/** Remove one registered security key. */
export async function removeSecurityKey(
  idToken: string,
  id: string
): Promise<number> {
  const body = await mfaApi<{ remaining?: unknown }>(
    "/api/auth/mfa/webauthn/credentials",
    { idToken, method: "DELETE", body: { id } }
  );

  return typeof body.remaining === "number" ? body.remaining : 0;
}
