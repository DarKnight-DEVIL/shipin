/** 
 * The production configuration check, in a module a plain Node process can load.
 * 
 * Split out of `index.ts` on purpose: that module builds `clientEnv` at load
 * time, and its `validateClientEnv` throws outside a build phase when a
 * `NEXT_PUBLIC_*` variable is absent. A container does not need those at
 * runtime — Next inlines them at build — so a preflight that imported
 * `index.ts` would abort with a misleading `NEXT_PUBLIC_…` error instead of
 * validating, which is exactly the failure it exists to prevent.
 * 
 * This file imports nothing. `src/config/env/entrypoint.test.ts` walks the
 * scripts that load it under `--experimental-strip-types` and fails if anything
 * in that chain becomes an `@/` alias or a package import.
 */

/** Server-only vars that MUST be present at runtime. */
export const REQUIRED_SERVER_ENV: ReadonlySet<string> = new Set([
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "SMTP_EMAIL",
  "SMTP_PASSWORD",
  "RESEND_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "APP_URL",
  // Admin MFA sessions cannot be signed without it. Moving to REQUIRED so
  // a missing secret fails at startup (build/start-preflight) instead of
  // 500-ing on the first admin request.
  "MFA_SESSION_SECRET",
]);

/** 
 * Server-only vars that are REQUIRED in production but optional in dev/test.
 * In production, missing these will throw at startup.
 */
export const PRODUCTION_REQUIRED_SERVER_ENV: ReadonlySet<string> = new Set([
  "PAYPAL_WEBHOOK_ID",
]);

/** 
 * Shared rate-limit store credentials: required in production, because
 * without them every instance limits on its own and the proxy fails open — a
 * misconfigured deploy would serve traffic with abuse protection off.
 * 
 * Only the local/CI E2E suite (a production build against a throwaway
 * database) may opt out, via {@link RATE_LIMIT_STORE_OPTIONAL_ENV}.
 */
/** 
 * Note for `envExample.test.ts`: it reads these three declarations out of this
 * file by name, so keep them here and keep the literal names quoted. A required
 * variable the template omits is a deploy that fails at boot with no clue where
 * the value comes from, and that test is the only thing that catches it.
 */
export const RATE_LIMIT_STORE_SERVER_ENV = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

/** Set to exactly \"1\" to allow booting production with no rate-limit store (E2E only). */
export const RATE_LIMIT_STORE_OPTIONAL_ENV = "RATE_LIMIT_STORE_OPTIONAL";

/** Set to exactly \"1\" to allow http://localhost for APP_URL/NEXT_PUBLIC_APP_URL (E2E only). */
export const APP_URL_E2E_OPTIONAL_ENV = "APP_URL_E2E_OPTIONAL";

/**
 * Emulator redirect variables. A real deployment with one of these set reads
 * and writes a throwaway emulator instead of Firestore: auth flows would
 * "work" in smoke tests while production data goes untouched. The startup
 * check refuses to boot in that state; the local E2E suite, which runs a
 * production build against emulators on purpose, opts out with
 * {@link EMULATOR_GUARD_OPTIONAL_ENV}.
 */
export const PRODUCTION_FORBIDDEN_ENV = [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_EMULATOR_HUB",
  "NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST",
  "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
] as const;

/** Set to exactly \"1\" to allow emulator variables in production (E2E only). */
export const EMULATOR_GUARD_OPTIONAL_ENV = "EMULATOR_GUARD_OPTIONAL";

/** Returns true when the emulator guard is disabled (E2E only). */
export function isEmulatorGuardOptional(): boolean {
  return process.env[EMULATOR_GUARD_OPTIONAL_ENV] === "1";
}

/** Refuse to boot production with an emulator redirect in the environment. */
function assertNoEmulators(): void {
  if (isEmulatorGuardOptional()) return;
  const set = PRODUCTION_FORBIDDEN_ENV.filter((key) => process.env[key]);
  if (set.length > 0) {
    throw new Error(
      `[ShipIN] FATAL: ${set.join(", ")} set in production - the server would read and write a ` +
        `throwaway emulator instead of live Firestore. Remove them from the deployment ` +
        `environment, or set ${EMULATOR_GUARD_OPTIONAL_ENV}=1 for the E2E suite only.`
    );
  }
}

/** Any other value, including \"true\", keeps the store required. */
export function isRateLimitStoreOptional(): boolean {
  return process.env[RATE_LIMIT_STORE_OPTIONAL_ENV] === "1";
}

/** Returns true when the APP_URL loopback exemption is active (E2E only). */
export function isAppUrlE2eOptional(): boolean {
  return process.env[APP_URL_E2E_OPTIONAL_ENV] === "1";
}

/** 
 * The two origins this deployment declares for itself, and they get the same
 * rule. APP_URL drives WebAuthn's relying-party origin; NEXT_PUBLIC_APP_URL is
 * its browser-visible copy and is folded into the CORS allowlist in
 * `lib/cors.ts` alongside it, so checking only one would leave the other able to
 * make a cleartext origin authoritative.
 * 
 * Both fail in confusing ways when they are not an absolute URL (\"foo\" parses
 * as a relative path and later throws inside the WebAuthn library), so check
 * the shape while the error can still name the variable.
 * 
 * It must also be https://, because it is the origin the app TRUSTS rather than
 * merely a link prefix: WebAuthn assertions are verified against it and the CORS
 * allowlist is built from it. A cleartext origin in a real deployment would let
 * anyone on the path serve pages at that origin and pass every origin check that
 * depends on this value.
 * 
 * Loopback may keep http only under the E2E opt-out. It is unreachable from a
 * network and the browser treats it as a secure context for WebAuthn anyway,
 * and `scripts/e2e-local.mjs` boots a production build on
 * http://localhost:3000, as does the compose stack — both already set
 * {@link RATE_LIMIT_STORE_OPTIONAL_ENV}. Without that flag a real deployment
 * could boot claiming http://localhost as the origin it trusts, which is
 * exactly the cleartext origin rule this check exists to enforce.
 */
const TRUSTED_ORIGIN_ENV = ["APP_URL", "NEXT_PUBLIC_APP_URL"] as const;

function assertAppUrlShape(): void {
  for (const key of TRUSTED_ORIGIN_ENV) assertTrustedOrigin(key);
}

function assertTrustedOrigin(key: (typeof TRUSTED_ORIGIN_ENV)[number]): void {
  const raw = process.env[key]?.trim();

  // Absence is reported by the missing-variable check, with its own message
  // (APP_URL), or by the client-env check (NEXT_PUBLIC_APP_URL).
  if (!raw) return;

  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }

  if (
    !parsed ||
    (parsed.protocol !== "http:" && parsed.protocol !== "https:")
  ) {
    throw new Error(
      `[ShipIN] FATAL: ${key} must be an absolute http(s) URL (for example https://shipin.app); got "${raw}".`
    );
  }

  if (parsed.protocol === "https:") return;

  if (!isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      `[ShipIN] FATAL: ${key} must use https:// in production; got "${raw}". ` +
        `It is the origin WebAuthn and the CORS allowlist trust, so http:// would make a cleartext origin authoritative. ` +
        `Only loopback (http://localhost) may stay http, and only for the E2E suite.`
    );
  }

  // Loopback over http is the local E2E build and the compose stack, both of
  // which already set the E2E opt-out. Without it this is a deployment
  // claiming a cleartext origin, which is the failure the https rule above
  // exists to prevent — loopback is not an exemption from that, only a value
  // the E2E suite is allowed to use.
  if (!isAppUrlE2eOptional()) {
    throw new Error(
      `[ShipIN] FATAL: ${key} may use http:// only on loopback with the E2E opt-out; got "${raw}". ` +
        `A deployment must serve https://, because it is the origin WebAuthn and the CORS allowlist trust. ` +
        `Set ${APP_URL_E2E_OPTIONAL_ENV}=1 only for the local E2E suite.`
    );
  }
}

/** Hosts that never leave the machine, so cleartext cannot be intercepted. */
function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  );
}

/** 
 * Endpoints that receive ShipIN's own credentials or incident data, so they must
 * never be configured over cleartext. All are optional — the callers fall back
 * to an https default or log a missing webhook — but a value that IS set has to
 * be https://:
 * 
 *  - PAYPAL_API_URL carries the client id and secret in a Basic auth header.
 *  - INDIA_POST_TRACKING_URL carries the India Post client credentials.
 *  - BREACH_ALERT_WEBHOOK_URL is itself the secret (anyone who holds it can post
 *    to the channel), and the alert body carries the breach description, its
 *    severity, its id and the number of affected users. http:// would expose
 *    both the capability and the incident report.
 */
const HTTPS_CREDENTIAL_ENDPOINT_ENV = [
  "PAYPAL_API_URL",
  "INDIA_POST_TRACKING_URL",
  "BREACH_ALERT_WEBHOOK_URL",
] as const;

function assertHttpsCredentialEndpoints(): void {
  for (const key of HTTPS_CREDENTIAL_ENDPOINT_ENV) {
    const raw = process.env[key]?.trim();

    // Absence is not this check's business: the default is https.
    if (!raw) continue;

    let parsed: URL | null = null;
    try {
      parsed = new URL(raw);
    } catch {
      parsed = null;
    }

    if (!parsed || parsed.protocol !== "https:") {
      throw new Error(
        `[ShipIN] FATAL: ${key} must be an absolute https:// URL; got "${raw}". ` +
          `ShipIN credentials or incident data are sent to this host, so http:// would expose them in transit.`
      );
    }
  }
}

/** 
 * Validates that all APP_ALLOWED_ORIGINS entries are valid absolute URLs.
 * In production, each entry must be https:// unless it is a loopback origin
 * with the E2E opt-out (APP_ALLOWED_ORIGINS_E2E_OPTIONAL=1).
 */
export function assertAppAllowedOrigins(): void {
  const raw = process.env["APP_ALLOWED_ORIGINS"]?.trim();

  if (!raw) return;

  const origins = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);

  for (const origin of origins) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(origin);
    } catch {
      parsed = null;
    }

    if (!parsed) {
      throw new Error(
        `[ShipIN] FATAL: APP_ALLOWED_ORIGINS entry "${origin}" is not a valid URL.`
      );
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(
        `[ShipIN] FATAL: APP_ALLOWED_ORIGINS entry "${origin}" must use https:// or http://; got "${origin}".`
      );
    }

    if (parsed.protocol === "http:") {
      // Allow http://localhost only with the E2E opt-out flag
      const hostname = parsed.hostname.toLowerCase();
      if (!/^localhost$/.test(hostname) && !hostname.endsWith(".localhost")) {
        if (!isAppAllowedOriginsE2eOptional()) {
          throw new Error(
            `[ShipIN] FATAL: APP_ALLOWED_ORIGINS entry "${origin}" may use http:// only on loopback with the E2E opt-out; got "${origin}". ` +
              `A production deployment must use https://, because it is the origin the CORS allowlist trusts. ` +
              `Set ${APP_ALLOWED_ORIGINS_E2E_OPTIONAL_ENV}=1 only for the local E2E suite.`
          );
        }
      }
    }
  }
}

/** 
 * Set to exactly \"1\" to allow cleartext origins in APP_ALLOWED_ORIGINS for loopback only in the E2E suite. 
 */
export const APP_ALLOWED_ORIGINS_E2E_OPTIONAL_ENV = "APP_ALLOWED_ORIGINS_E2E_OPTIONAL";

/** Returns true when the APP_ALLOWED_ORIGINS loopback exemption is active (E2E only). */
export function isAppAllowedOriginsE2eOptional(): boolean {
  return process.env[APP_ALLOWED_ORIGINS_E2E_OPTIONAL_ENV] === "1";
}

export function validateProductionRequiredEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  assertAppUrlShape();
  assertAppAllowedOrigins();
  assertHttpsCredentialEndpoints();
  assertNoEmulators();

  const required: string[] = [
    ...REQUIRED_SERVER_ENV,
    ...PRODUCTION_REQUIRED_SERVER_ENV,
  ];

  if (!isRateLimitStoreOptional()) {
    required.push(...RATE_LIMIT_STORE_SERVER_ENV);
  }

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const optOutHint = missing.some((key) =>
      (RATE_LIMIT_STORE_SERVER_ENV as readonly string[]).includes(key)
    )
      ? ` Rate limiting would be per-instance and fail open; set both, or set ${RATE_LIMIT_STORE_OPTIONAL_ENV}=1 for the E2E suite only.`
      : "";

    throw new Error(
      `[ShipIN] FATAL: Missing required production environment variables: ${missing.join(", ")}. ` +
        `These must be set for production deployment.${optOutHint}`
    );
  }
}