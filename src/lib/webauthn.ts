import "server-only";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  Base64URLString,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { isProduction, serverEnv } from "@/config/env";

/**
 * WebAuthn (passkey / security key) support.
 *
 * All cryptography is delegated to @simplewebauthn so the only things this
 * module owns are: which relying party we claim to be, how credentials are
 * shaped in Firestore, and how long a challenge stays valid.
 *
 * A challenge must be stored server-side between the two ceremony steps and
 * consumed on use, otherwise an assertion could be replayed.
 */

export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const WEBAUTHN_RP_NAME = "ShipIN";

export interface StoredWebAuthnCredential {
  /** base64url credential ID */
  credentialID: string;
  /** base64url COSE public key */
  publicKey: string;
  /** signature counter, used to detect cloned authenticators */
  counter: number;
  transports: string[];
  name: string;
  createdAt: number;
  deviceType?: "singleDevice" | "multiDevice";
  backedUp?: boolean;
}

/** Shape stored at `users/{uid}.mfa.webauthn`. */
export interface WebAuthnRecord {
  enabled?: boolean;
  credentials?: StoredWebAuthnCredential[];
  /** legacy shape written by the previous stub routes */
  credentialIds?: string[];
  pendingChallenge?: string | null;
  pendingExpires?: number | null;
}

/**
 * The origin and RP ID this deployment answers the ceremony for.
 *
 * Both come from APP_URL (not the request Host header) so a forged Host cannot
 * change which origin an assertion is checked against.
 */
export function getWebAuthnConfig(): {
  origin: string;
  rpID: string;
  rpName: string;
} {
  const appUrl = (serverEnv.APP_URL || "http://localhost:3000").trim();

  let origin = appUrl;

  try {
    origin = new URL(appUrl).origin;
  } catch {
    origin = "http://localhost:3000";
  }

  const rpID = new URL(origin).hostname;

  return { origin, rpID, rpName: WEBAUTHN_RP_NAME };
}

/** Origins accepted for local development in addition to the configured one. */
function expectedOrigins(): string[] {
  const { origin } = getWebAuthnConfig();

  if (isProduction) return [origin];

  return Array.from(
    new Set([origin, "http://localhost:3000", "http://127.0.0.1:3000"])
  );
}

/** Normalize the stored record, including the legacy `credentialIds` shape. */
export function readStoredCredentials(
  record: WebAuthnRecord | undefined | null
): StoredWebAuthnCredential[] {
  if (!record) return [];

  if (Array.isArray(record.credentials) && record.credentials.length > 0) {
    return record.credentials.filter(
      (credential) =>
        typeof credential?.credentialID === "string" &&
        typeof credential?.publicKey === "string"
    );
  }

  return [];
}

export function isChallengeExpired(
  expires: unknown,
  now = Date.now()
): boolean {
  return typeof expires !== "number" || expires <= now;
}

/**
 * Fields written when a challenge starts.
 *
 * Deliberately does not flip `enabled`: starting registration must not look
 * like a finished enrollment.
 */
export function challengeFields(challenge: string, now = Date.now()) {
  return {
    "mfa.webauthn.pendingChallenge": challenge,
    "mfa.webauthn.pendingExpires": now + WEBAUTHN_CHALLENGE_TTL_MS,
  };
}

/** Fields written once a challenge is used or abandoned. */
export function clearedChallengeFields() {
  return {
    "mfa.webauthn.pendingChallenge": null,
    "mfa.webauthn.pendingExpires": null,
  };
}

export async function buildRegistrationOptions(params: {
  uid: string;
  userName: string;
  displayName: string;
  excludeCredentials: StoredWebAuthnCredential[];
}) {
  const { rpID, rpName } = getWebAuthnConfig();

  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(params.uid),
    userName: params.userName,
    userDisplayName: params.displayName,
    // Security keys *and* platform authenticators are both acceptable; the
    // account already has a code-based factor, so this is a second factor.
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    attestationType: "none",    excludeCredentials: params.excludeCredentials.map((credential) => ({
      id: credential.credentialID,
      transports: credential.transports as never,
    })),
  });
}
export async function verifyRegistration(params: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
}): Promise<
  | { verified: false }
  | { verified: true; credential: StoredWebAuthnCredential }
> {
  const { rpID } = getWebAuthnConfig();

  let result;

  try {
    result = await verifyRegistrationResponse({
      response: params.response,
      expectedChallenge: params.expectedChallenge,
      expectedOrigin: expectedOrigins(),
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    // Malformed or unparseable attestation: a failure, not a server error.
    return { verified: false };
  }

  if (!result.verified || !result.registrationInfo) {
    return { verified: false };
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    result.registrationInfo;

  return {
    verified: true,
    credential: {
      credentialID: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: (credential.transports ?? []) as string[],
      name: "",
      createdAt: Date.now(),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    },
  };
}

export async function buildAuthenticationOptions(params: {
  allowCredentials: StoredWebAuthnCredential[];
}) {
  const { rpID } = getWebAuthnConfig();

  return generateAuthenticationOptions({
    rpID,
    allowCredentials: params.allowCredentials.map((credential) => ({
      id: (credential as { credentialID?: string; id?: string }).credentialID ?? (credential as { credentialID?: string; id?: string }).id ?? "",
      transports: credential.transports as never,
    })),
    // The account proved its password/ID token; this proves possession.
    userVerification: "preferred",
  });
}
export async function verifyAssertion(params: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: StoredWebAuthnCredential;
}): Promise<{ verified: boolean; newCounter: number }> {
  const { rpID } = getWebAuthnConfig();

  try {
    const result = await verifyAuthenticationResponse({
      response: params.response,
      expectedChallenge: params.expectedChallenge,
      expectedOrigin: expectedOrigins(),
      expectedRPID: rpID,
      credential: {
        id: (params.credential as { credentialID?: string; id?: string }).credentialID as Base64URLString,
        publicKey: new Uint8Array(
          Buffer.from(params.credential.publicKey, "base64url")
        ),
        counter: params.credential.counter,
        transports: params.credential.transports as never,
      },
      requireUserVerification: false,
    });

    return {
      verified: result.verified,
      newCounter: result.authenticationInfo?.newCounter ?? params.credential.counter,
    };
  } catch {
    // Library throws on malformed or mismatched assertions; treat as a failure.
    return { verified: false, newCounter: params.credential.counter };
  }
}
