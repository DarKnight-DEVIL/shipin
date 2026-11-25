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
import { recordAppCheckFailureReason } from "@/lib/appCheckMetrics";

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
 * Which claim a rejected token failed, as a fixed label.
 *
 * The verifier's own message embeds the token's `aud`, but the *shape* of the
 * failure is safe to report and is the difference between two unrelated fixes:
 * an audience mismatch means the site key belongs to another Firebase project,
 * while a signature failure means the public keys could not be used at all.
 * Never returns any part of the token or the project identifiers.
 */
/**
 * Remove anything credential-shaped from a verifier message before it is
 * recorded: a JWT, a bare UUID (the debug-token form) or a long opaque run.
 * The messages this SDK produces quote the failed claim, never the signature,
 * but stripping is cheaper than trusting that.
 */
export function sanitizeAppCheckMessage(message: string): string {
  return message
    .replace(/ey[A-Za-z0-9_-]{6,}(\.[A-Za-z0-9_-]+){0,2}/g, "[jwt]")
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, "[uuid]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[opaque]")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The token's public claims, for diagnosis only.
 *
 * `aud` and `iss` are identifiers that already ship in the client bundle; the
 * signature, the subject and any secret stay out. Without this, a refusal cannot
 * be told apart from a token minted for another Firebase project - and that
 * distinction is a Google Cloud fix versus a server fix.
 */
export function describeAppCheckTokenClaims(token: string): string {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "claims=not-a-jwt";

    const decoded = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { aud?: unknown; iss?: unknown; exp?: unknown };

    const aud = Array.isArray(decoded.aud)
      ? decoded.aud.join(",")
      : typeof decoded.aud === "string"
        ? decoded.aud
        : "(none)";
    const iss = typeof decoded.iss === "string" ? decoded.iss : "(none)";
    const exp = typeof decoded.exp === "number" ? decoded.exp : 0;

    return sanitizeAppCheckMessage(
      `aud=${aud} iss=${iss} age=${Math.round(Date.now() / 1000) - exp}s-to-expiry`
    ).slice(0, 200);
  } catch {
    // A debug token is a bare UUID, not a JWT: no claims to read.
    return "claims=not-a-jwt";
  }
}

/**
 * Which claim a rejected token failed.
 *
 * The fall-through is explicit rather than a guess: an unrecognised error is
 * reported with its own code and message excerpt, because labelling it
 * "signature" (the original behaviour) would claim a cause it had not
 * established. That label cost a round of debugging on its own.
 */
export function classifyAppCheckFailure(error: unknown): string {
  const code =
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);

  if (code === "app-check/invalid-credential") return "no-project-id";
  if (message.includes('incorrect "aud"')) return "audience-mismatch";
  if (message.includes("incorrect algorithm")) return "algorithm-mismatch";
  if (message.includes('"iss"')) return "issuer-mismatch";
  if (message.includes('"sub"')) return "subject-missing";
  if (/expired|is not yet valid/i.test(message)) return "time-invalid";
  if (message.includes("Invalid token signature")) return "invalid-signature";
  if (/fetch|network|socket|timeout|ECONN|ENOTFOUND|getaddrinfo/i.test(message)) {
    return "jwks-unreachable";
  }

  return `unrecognized:${code || "no-code"}:${sanitizeAppCheckMessage(message).slice(0, 80)}`;
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
    const reason = classifyAppCheckFailure(error);
    // The claim that failed, never the token or the project identifiers: a
    // rejection nobody can attribute is what turned this into a guessing game.
    console.error("[AppCheck] Token verification failed:", {
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
      reason,
      claims: describeAppCheckTokenClaims(token),
    });
    recordAppCheckFailureReason(
      `${reason} ${describeAppCheckTokenClaims(token)}`
    );
    return "invalid";
  }
}