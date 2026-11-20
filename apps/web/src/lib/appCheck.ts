/**
 * Server-side App Check verification for ShipIN API routes.
 *
 * Firebase's own enforcement covers services the client talks to directly
 * (Identity Toolkit, Firestore, Storage). It does **not** cover our route
 * handlers: they authenticate with the Admin SDK, which bypasses App Check
 * entirely. So while `APP_CHECK_ENFORCEMENT=true`, a request must also present
 * a token this project issued, proving it came from a real instance of the app.
 */

import "server-only";

import { clientEnv, isProduction, serverEnv } from "@/config/env";
import { childLogger } from "@/lib/logger";

/** Firebase's conventional header for a client-supplied App Check token. */
export const APP_CHECK_HEADER = "x-firebase-appcheck";

const appCheckLogger = childLogger({ service: "appcheck" });

export type AppCheckOutcome = "ok" | "missing" | "invalid" | "not-enforced";

/**
 * Whether API routes must reject requests without a valid App Check token.
 *
 * Precedence:
 *   1. An explicit flag wins (`true` enforces, `false` disables).
 *   2. Unset defaults to ENFORCED in a production build that ships a site key.
 *      A forgotten variable must not silently disable the check on a live
 *      deployment; the client already sends X-Firebase-AppCheck whenever a
 *      site key is configured, so enabling it cannot lock browser clients out.
 *   3. Unset with no site key (local development, CI, previews) stays off, so
 *      no Firebase project is needed to run the app.
 */
export function isAppCheckEnforced(): boolean {
  const flag = serverEnv.APP_CHECK_ENFORCEMENT?.trim().toLowerCase();

  if (flag === "true") return true;
  if (flag === "false") return false;

  return (
    isProduction && Boolean(clientEnv.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY)
  );
}

export type AppCheckStatus =
  "disabled" | "configured" | "enforced" | "misconfigured";

export interface AppCheckConfiguration {
  /** Whether clients hold a site key and can mint tokens at all. */
  configured: boolean;
  /** Whether routes reject requests without a verifiable token. */
  enforced: boolean;
  status: AppCheckStatus;
}

/**
 * The two independent switches, reported separately.
 *
 * Enforcement without a site key is `misconfigured`, not `enforced`: every
 * browser request would be rejected because the client has no way to mint a
 * token. This is the single definition — `/api/health` and the startup warning
 * both read it, so they cannot disagree about the deployment's state.
 */
export function getAppCheckStatus(): AppCheckConfiguration {
  const configured = Boolean(clientEnv.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY);
  const enforced = isAppCheckEnforced();

  const status: AppCheckStatus = enforced
    ? configured
      ? "enforced"
      : "misconfigured"
    : configured
      ? "configured"
      : "disabled";

  return { configured, enforced, status };
}

/**
 * Validate the App Check configuration at startup.
 *
 * In production:
 * - If enforcement is ON but no site key is configured → THROW (fail-fast).
 *   Every browser request would be rejected; this is a hard deployment failure.
 * - If a site key is configured but enforcement is OFF → WARN.
 *   Production should enforce; not enforcing means API routes accept requests
 *   without App Check tokens.
 *
 * In dev/test: never throw, only warn if misconfigured.
 *
 * @returns the same configuration object as {@link getAppCheckStatus}.
 */
export function reportAppCheckStatus(): AppCheckConfiguration {
  const configuration = getAppCheckStatus();

  if (configuration.status === "misconfigured") {
    // Enforcement without site key = total failure for browser clients.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[AppCheck] APP_CHECK_ENFORCEMENT is on but NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is empty. " +
          "Clients cannot mint an App Check token, so every browser API request is rejected. " +
          "Set the site key in production, or turn enforcement off."
      );
    }
    appCheckLogger.warn(
      "[AppCheck] APP_CHECK_ENFORCEMENT is on but NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is empty. " +
        "Clients cannot mint an App Check token. Set the site key, or turn enforcement off."
    );
  } else if (
    configuration.configured &&
    !configuration.enforced &&
    process.env.NODE_ENV === "production"
  ) {
    // Site key exists but enforcement is off in production - warn but don't fail.
    appCheckLogger.warn(
      "[AppCheck] NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is set but APP_CHECK_ENFORCEMENT is not 'true'. " +
        "Production deployments should enforce App Check. API routes will accept requests without tokens."
    );
  }

  return configuration;
}

/**
 * Verify the App Check token on a request.
 *
 * Never throws: a rejected token is an ordinary outcome that the caller turns
 * into a 401, and a broken verifier must not surface a 500 to the client.
 */
export async function verifyAppCheckRequest(
  request: Request
): Promise<AppCheckOutcome> {
  if (!isAppCheckEnforced()) return "not-enforced";

  const token = request.headers.get(APP_CHECK_HEADER);
  if (!token) return "missing";

  try {
    // Loaded here, never at module scope. `firebase-admin/app-check` pulls in
    // jwks-rsa, which `require()`s jose's ESM-only entry; on the deployed
    // serverless runtime that throws ERR_REQUIRE_ESM while the module graph
    // loads. `instrumentation.ts` imports this file at boot to report the two
    // flags above, so a top-level import there took the whole server down —
    // Next logged "an error occurred while loading the instrumentation hook"
    // and answered every route, static pages included, with 500.
    //
    // The status helpers need none of the SDK, and verification is the only
    // thing that does, so this is the one place it may be loaded.
    const { getAppCheck } = await import("firebase-admin/app-check");
    await getAppCheck().verifyToken(token);
    return "ok";
  } catch (error) {
    // Log a code only: verification errors can embed the token or app id.
    console.error("[AppCheck] Token verification failed:", {
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
    return "invalid";
  }
}
