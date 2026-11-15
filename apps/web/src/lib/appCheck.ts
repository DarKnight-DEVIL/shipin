/**
 * Server-side App Check verification for ShipIN API routes.
 *
 * Firebase's own enforcement covers services the client talks to directly
 * (Identity Toolkit, Firestore, Storage). It does **not** cover our route
 * handlers: they authenticate with the Admin SDK, which bypasses App Check
 * entirely. So while `APP_CHECK_ENFORCEMENT=true`, a request must also present
 * a token this project issued, proving it came from a real instance of the app.
 */

import { getAppCheck } from "firebase-admin/app-check";

import { clientEnv, serverEnv } from "@/config/env";

/** Firebase's conventional header for a client-supplied App Check token. */
export const APP_CHECK_HEADER = "x-firebase-appcheck";

export type AppCheckOutcome = "ok" | "missing" | "invalid" | "not-enforced";

/**
 * Whether API routes must reject requests without a valid App Check token.
 *
 * Off unless explicitly switched on, so local development and CI never need a
 * registered Firebase project.
 */
export function isAppCheckEnforced(): boolean {
  return serverEnv.APP_CHECK_ENFORCEMENT === "true";
}

export type AppCheckStatus =
  | "disabled"
  | "configured"
  | "enforced"
  | "misconfigured";

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
 * Log the App Check configuration at startup. Never throws.
 *
 * Mirrors `reportRateLimitStoreStatus`: a configuration problem is logged once
 * at boot and surfaced as `degraded` by `/api/health`, rather than crashing a
 * deployment that is otherwise serving. Here the problem is total — enforced
 * without a site key rejects every browser request — so the warning says so
 * plainly and names both ways out.
 *
 * @returns the same configuration object as {@link getAppCheckStatus}.
 */
export function reportAppCheckStatus(): AppCheckConfiguration {
  const configuration = getAppCheckStatus();

  if (configuration.status === "misconfigured") {
    console.warn(
      "[AppCheck] APP_CHECK_ENFORCEMENT is on but " +
        "NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is empty. Clients cannot mint " +
        "an App Check token, so every browser API request is rejected with " +
        "APP_CHECK_FAILED and /api/health reports degraded. Set the site key, " +
        "or turn enforcement off."
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
