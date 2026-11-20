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

/**
 * Relying party local development falls back to when APP_URL is not a domain
 * this deployment owns.
 *
 * A passkey is bound to its RP ID for life, so a preview host such as
 * `*.vercel.app` must never become the RP ID. Development still needs one to
 * exercise the ceremony, and loopback is what a browser accepts over http — it
 * is also the origin `next dev` serves by default.
 */
const DEV_LOOPBACK_ORIGIN = "http://localhost:3000";

/**
 * An `http` origin on the loopback interface, with or without a port.
 *
 * `127.0.0.1` is accepted as a *request* origin so the config stays
 * self-consistent, but a passkey can only be created on `localhost`: browsers
 * refuse any RP ID at an IP-address origin (`SecurityError: This is an invalid
 * domain`), which is why no alias origin is accepted at verification either.
 */
function isLoopbackHttpOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

/**
 * The origin a development ceremony actually runs on.
 *
 * `next dev -p 4000` — or Next falling back to 3001 when 3000 is taken — serves
 * a different origin than the one baked into APP_URL, and a passkey cannot be
 * used across origins. The value comes from the request, so only loopback
 * origins are accepted: a forged `Host` can then at worst name another loopback
 * port, never a domain an attacker controls. Outside development this is never
 * consulted.
 */
function devOriginFor(
  requestOrigin: string | undefined,
  configuredOrigin: string
): string {
  const candidate = requestOrigin?.trim();

  if (candidate) {
    try {
      const origin = new URL(candidate).origin;

      if (isLoopbackHttpOrigin(origin)) return origin;
    } catch {
      // Unparseable: fall through to the configured/fallback origin.
    }
  }

  return isLoopbackHttpOrigin(configuredOrigin)
    ? configuredOrigin
    : DEV_LOOPBACK_ORIGIN;
}

/**
 * Normalize the configured deployment URL to an origin.
 *
 * There is no hard-coded production host on purpose. A passkey is bound to one
 * RP ID for its whole life, so silently falling back to the wrong origin
 * registers credentials that can never be used again — and it hides the
 * misconfiguration until a user tries to sign in with a security key. In
 * production this therefore throws instead of guessing; development still
 * falls back to loopback. The Firebase Hosting aliases are not accepted here
 * either, because `vercel.app`, `web.app` and `firebaseapp.com` are separate
 * registrable domains.
 */
export function resolveAppOrigin(
  appUrl: string | undefined,
  production: boolean = isProduction
): string {
  const candidate = appUrl?.trim();

  if (candidate) {
    try {
      return new URL(candidate).origin;
    } catch {
      // Invalid URL: fall through to the per-environment decision below.
    }
  }

  if (production) {
    throw new Error(
      "APP_URL must be an absolute URL in production: WebAuthn relies on it for the relying-party origin."
    );
  }

  return DEV_LOOPBACK_ORIGIN;
}

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

/**
 * The credential id for a ceremony call.
 *
 * Legacy records wrote it as `id`; one helper keeps that compatibility in a
 * single cast instead of two casts at every call site.
 */
function credentialIdOf(
  credential: StoredWebAuthnCredential
): Base64URLString {
  const legacy = credential as unknown as { id?: string };
  return (credential.credentialID || legacy.id || "") as Base64URLString;
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
 * Domains shared by unrelated tenants.
 *
 * An RP ID is a registrable domain, and a passkey registered for
 * `something.vercel.app` is scoped to `vercel.app` — any other project on that
 * hosting could then ask for a credential for the same RP ID. The app must be
 * served from a domain it owns.
 */
const SHARED_HOSTING_SUFFIXES = [
  "vercel.app",
  "netlify.app",
  "web.app",
  "firebaseapp.com",
  "pages.dev",
  "workers.dev",
  "github.io",
  "herokuapp.com",
  "onrender.com",
  "fly.dev",
] as const;

export function isSharedHostingDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();

  return SHARED_HOSTING_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * The origin and RP ID this deployment answers the ceremony for.
 *
 * In production both come from APP_URL, never the request, so a forged Host
 * cannot change which origin an assertion is checked against. Development also
 * accepts the loopback origin the request arrived on — `next dev` may run on
 * another port — and ignores any non-loopback value.
 */
export function getWebAuthnConfig(requestOrigin?: string): {
  origin: string;
  rpID: string;
  rpName: string;
} {
  const origin = resolveAppOrigin(serverEnv.APP_URL);
  const rpID = new URL(origin).hostname;
  const sharedHosting = isSharedHostingDomain(rpID);

  // Development follows the origin the ceremony is actually served from. The
  // committed env files point APP_URL at the Vercel deployment, and `next dev`
  // may not even be on port 3000, so the configured host is unusable as an RP
  // ID here. Production keeps refusing a shared host: an RP ID under
  // `vercel.app` would cover every other tenant on the provider.
  if (!isProduction && (sharedHosting || isLoopbackHttpOrigin(origin))) {
    const devOrigin = devOriginFor(requestOrigin, origin);

    return {
      origin: devOrigin,
      rpID: new URL(devOrigin).hostname,
      rpName: WEBAUTHN_RP_NAME,
    };
  }

  if (sharedHosting) {
    throw new Error(
      `APP_URL points at the shared hosting domain "${rpID}". WebAuthn would register passkeys for the whole hosting provider, so point APP_URL at a domain ShipIN owns.`
    );
  }

  return { origin, rpID, rpName: WEBAUTHN_RP_NAME };
}

function expectedOrigins(requestOrigin?: string): string[] {
  return [getWebAuthnConfig(requestOrigin).origin];
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
  requestOrigin?: string;
}) {
  const { rpID, rpName } = getWebAuthnConfig(params.requestOrigin);

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
    attestationType: "none",
    excludeCredentials: params.excludeCredentials.map((credential) => ({
      id: credential.credentialID,
      transports: credential.transports as never,
    })),
  });
}

export async function verifyRegistration(params: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  requestOrigin?: string;
}): Promise<
  { verified: false } | { verified: true; credential: StoredWebAuthnCredential }
> {
  const { rpID } = getWebAuthnConfig(params.requestOrigin);

  let result;

  try {
    result = await verifyRegistrationResponse({
      response: params.response,
      expectedChallenge: params.expectedChallenge,
      expectedOrigin: expectedOrigins(params.requestOrigin),
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
  requestOrigin?: string;
}) {
  const { rpID } = getWebAuthnConfig(params.requestOrigin);

  return generateAuthenticationOptions({
    rpID,
    allowCredentials: params.allowCredentials.map((credential) => ({
      id: credentialIdOf(credential),
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
  requestOrigin?: string;
}): Promise<{ verified: boolean; newCounter: number }> {
  const { rpID } = getWebAuthnConfig(params.requestOrigin);

  try {
    const result = await verifyAuthenticationResponse({
      response: params.response,
      expectedChallenge: params.expectedChallenge,
      expectedOrigin: expectedOrigins(params.requestOrigin),
      expectedRPID: rpID,
      credential: {
        id: credentialIdOf(params.credential),
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
      newCounter:
        result.authenticationInfo?.newCounter ?? params.credential.counter,
    };
  } catch {
    // Library throws on malformed or mismatched assertions; treat as a failure.
    return { verified: false, newCounter: params.credential.counter };
  }
}
