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
import { appCheckClient } from "@/instrumentation";

/** Firebase's conventional header for a client-supplied App Check token. */
export const APP_CHECK_HEADER = "x-firebase-appcheck";

export const appCheckLogger = childLogger({ service: "appcheck" });

export type AppCheckOutcome = "ok" | "missing" | "invalid" | "not-enforced";

/**
 * Whether API routes must reject requests without a valid App Check token.
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
 */
export async function verifyAppCheckRequest(
  request: Request
): Promise<AppCheckOutcome> {
  if (!isAppCheckEnforced()) return "not-enforced";

  const token = request.headers.get(APP_CHECK_HEADER);
  if (!token) return "missing";

  try {
    // Use the App Check client initialized once at boot in instrumentation.ts.
    // Falls back to dynamic import if boot-time initialization failed.
    let getAppCheckFn: (app?: import("firebase-admin/app").App) => import("firebase-admin/app-check").AppCheck;
    if (appCheckClient) {
      getAppCheckFn = appCheckClient;
    } else {
      const { getAppCheck } = await import("firebase-admin/app-check");
      getAppCheckFn = getAppCheck;
    }
    await getAppCheckFn().verifyToken(token);
    return "ok";
  } catch (error) {
    // Log a code only: verification errors can embed the token or app id.
    console.error("[AppCheck] Token verification failed:", {
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
    return "invalid";
  }
}