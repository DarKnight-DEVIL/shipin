import { isProduction, serverEnv } from "@/config/env";
import { resolveAppOrigin } from "./webauthn";

/**
 * Does the host serving this request match the origin passkeys are registered for?
 *
 * WebAuthn is bound to one origin for the life of a credential. In production the
 * accepted origin comes from `APP_URL`, never from the request (see
 * `getWebAuthnConfig`), so a forged `Host` header cannot widen it - but the reverse
 * mistake is silent: `APP_URL` naming a hostname the deployment is no longer served
 * on makes every ceremony fail while the rest of the site works, and the first person
 * to find out is a user whose security key "does not work".
 *
 * This turns that into a probe-visible fact. The comparison is hostnames, not full
 * origins: the RP ID is the hostname, a dev server speaks `http` where the configured
 * origin is `https`, and a proxy may terminate TLS without the two agreeing on scheme.
 *
 * A mismatch only counts as degraded in production. Under `next dev` the configured
 * `APP_URL` is the deployed host and the request arrives on `localhost`, so a mismatch
 * there is the normal case, not a fault.
 */
export interface WebAuthnHealth {
  /** Origin passkeys are verified against, or null when APP_URL is unusable. */
  origin: string | null;
  /** Relying-party ID (`origin`'s hostname), or null. */
  rpID: string | null;
  /** Hostname this request was served on, lowercased and port-stripped. */
  servedHost: string | null;
  /** null when either side is unknown: no judgement without both. */
  matches: boolean | null;
  /** Failure text when APP_URL cannot produce an origin, else null. */
  error: string | null;
  /** True when passkey ceremonies on this host cannot succeed. */
  degraded: boolean;
}

/** `Example.COM:443.` -> `example.com`. Ports and the root dot are not part of an RP ID. */
export function normalizeHost(value: string | null | undefined): string | null {
  const candidate = value?.trim();

  if (!candidate) return null;

  // The root dot comes first: `shipin.app:443.` is a port *and* a root dot, and
  // stripping the port first would leave `shipin.app.` -> a different string.
  const withoutRootDot = candidate.replace(/\.+$/, "");

  // A bracketed IPv6 host keeps its brackets; `new URL` would otherwise need a scheme.
  const withoutPort = withoutRootDot.startsWith("[")
    ? withoutRootDot.replace(/\](:\d+)?$/, "]")
    : withoutRootDot.replace(/:\d+$/, "");

  return withoutPort.toLowerCase() || null;
}

export function webauthnHealth(
  servedHostHeader: string | null | undefined,
  options: { appUrl?: string; production?: boolean } = {}
): WebAuthnHealth {
  const production = options.production ?? isProduction;
  const servedHost = normalizeHost(servedHostHeader);

  let origin: string | null = null;
  let error: string | null = null;

  try {
    origin = resolveAppOrigin(options.appUrl ?? serverEnv.APP_URL, production);
  } catch (thrown) {
    // `resolveAppOrigin` refuses to guess in production; the message is the operator's
    // instruction, so it is passed through rather than flattened into "misconfigured".
    error = thrown instanceof Error ? thrown.message : String(thrown);
  }

  const rpID = origin ? normalizeHost(new URL(origin).hostname) : null;
  const matches =
    rpID && servedHost ? rpID === servedHost : null;

  return {
    origin,
    rpID,
    servedHost,
    matches,
    error,
    degraded: production && (matches === false || (origin === null && error !== null)),
  };
}
