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
  /**
   * RP ID this credential was enrolled for.
   *
   * Absent on credentials written before the field existed, which are treated as
   * "whatever this deployment uses now". Once a deployment moves to another
   * domain, a credential is usable only where this matches the current RP ID -
   * so the admin UI can say which keys are dead instead of offering a key that
   * silently fails.
   */
  rpID?: string;
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
 * True when the host IS a shared-hosting suffix, not merely under one.
 *
 * The distinction is the whole point. A WebAuthn RP ID may not claim a public
 * suffix - Chromium rejects an RP ID that does not extend past the caller's own
 * public suffix - but a single deployment's hostname is a legitimate RP ID, and
 * browsers accept it: a page on `foo.up.railway.app` cannot claim `railway.app`,
 * while `foo.up.railway.app` itself is fine. Refusing every host under a shared
 * suffix therefore blocks a setup the browser allows, and that is the situation
 * a deployment on `<project>.vercel.app` is in.
 */
export function isBareSharedHostingDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();

  return SHARED_HOSTING_SUFFIXES.some((suffix) => host === suffix);
}

/**
 * Resolve the relying-party ID, honouring an explicit `WEBAUTHN_RP_ID`.
 *
 * An RP ID may be a *parent* of the origin: a passkey registered for
 * `shipin.com` works on `app.shipin.com`, `track.shipin.com`, or anything else
 * beneath it. That is the difference between moving a deployment to a new
 * subdomain for free and asking every user to re-enrol, so a deployment that
 * expects to move keeps its RP ID one level up.
 *
 * Anything that would widen the scope beyond a domain this deployment owns is
 * refused rather than clamped: an RP ID of `com` or `vercel.app` would let other
 * tenants (or the public suffix itself) claim the same credentials.
 */
export function resolveRpID(origin: string, configured?: string): string {
  const originHost = new URL(origin).hostname.toLowerCase();
  const candidate = configured?.trim().toLowerCase();

  if (!candidate) return originHost;

  if (
    candidate.includes("://") ||
    candidate.includes("/") ||
    candidate.includes(":")
  ) {
    throw new Error(
      `WEBAUTHN_RP_ID must be a bare hostname such as "shipin.com", not "${configured}".`
    );
  }

  // `app.shipin.com` under `shipin.com`: compared by labels, so `notshipin.com`
  // does not qualify as a suffix of `shipin.com`.
  const isParent =
    originHost === candidate || originHost.endsWith(`.${candidate}`);

  if (!isParent) {
    throw new Error(
      `WEBAUTHN_RP_ID "${candidate}" is not a parent domain of APP_URL's host "${originHost}". A passkey can only be used on the RP ID it was registered for, so an unrelated value would make every ceremony fail.`
    );
  }

  if (isBareSharedHostingDomain(candidate)) {
    throw new Error(
      `WEBAUTHN_RP_ID "${candidate}" is a shared hosting domain: WebAuthn would register passkeys for every project on that host.`
    );
  }

  if (!candidate.includes(".") && candidate !== "localhost") {
    throw new Error(
      `WEBAUTHN_RP_ID "${candidate}" is a public suffix, not a domain this deployment owns.`
    );
  }

  // A literal address cannot be an RP ID: browsers refuse to register a passkey
  // at an IP origin, so accepting one here would promise credentials that can
  // never be created.
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(candidate) || candidate.startsWith("[")) {
    throw new Error(
      `WEBAUTHN_RP_ID "${candidate}" is an IP address; browsers only issue passkeys for domain names.`
    );
  }

  return candidate;
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
  const bareSharedHost = isBareSharedHostingDomain(rpID);

  // Development follows the origin the ceremony is actually served from. The
  // committed env files point APP_URL at the Vercel deployment, and `next dev`
  // may not even be on port 3000, so the configured host is unusable as an RP
  // ID here. Production only refuses the shared suffix itself: an RP ID under
  // it is scoped to this one deployment, which is exactly what a passkey wants.
  if (!isProduction && (sharedHosting || isLoopbackHttpOrigin(origin))) {
    const devOrigin = devOriginFor(requestOrigin, origin);

    return {
      origin: devOrigin,
      rpID: new URL(devOrigin).hostname,
      rpName: WEBAUTHN_RP_NAME,
    };
  }

  if (bareSharedHost) {
    throw new Error(
      `APP_URL points at the shared hosting domain "${rpID}". WebAuthn would register passkeys for every project on that host, so point APP_URL at this deployment's own hostname or a domain ShipIN owns.`
    );
  }

  return {
    origin,
    rpID: resolveRpID(origin, serverEnv.WEBAUTHN_RP_ID),
    rpName: WEBAUTHN_RP_NAME,
  };
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
      rpID,
    },
  };
}

/**
 * Can this credential be used against `rpID`?
 *
 * A credential carries the RP ID it was enrolled for. Absent means it predates the
 * field, so it belongs to whatever this deployment uses - the ceremonial origin is
 * the only thing that changes between deployments, not before.
 */
export function credentialUsableHere(
  credential: StoredWebAuthnCredential,
  rpID: string
): boolean {
  const enrolledFor = credential.rpID?.trim().toLowerCase();

  return !enrolledFor || enrolledFor === rpID.toLowerCase();
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
