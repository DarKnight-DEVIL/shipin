/**
 * App Check debug token injection for the signed-in E2E specs.
 *
 * A deployment that enforces App Check (staging, production) refuses every
 * authenticated API call from a browser that cannot pass reCAPTCHA Enterprise
 * attestation — which is every CI runner. Firebase's documented answer is a
 * debug token: registered once under App Check → Debug tokens, exchanged by
 * the SDK instead of an attestation result, revocable in the console.
 *
 * The token is injected at RUNTIME, before the app loads — never baked into
 * the deployment's bundle, where it would be public and would defeat App Check
 * for that deployment. The client (`src/lib/firebase.ts`) honours a
 * `window.FIREBASE_APPCHECK_DEBUG_TOKEN` set before its scripts run.
 *
 * Set `E2E_APPCHECK_DEBUG_TOKEN` to the registered token. Unset — local
 * emulator runs, or a target with enforcement off — this is a no-op.
 */
import type { Page } from "@playwright/test";

export async function injectAppCheckDebugToken(page: Page): Promise<void> {
  const token = process.env.E2E_APPCHECK_DEBUG_TOKEN?.trim();
  if (!token) return;

  await page.addInitScript((value) => {
    (window as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
      value;
  }, token);
}

/* ------------------------------------------------------------------------ */

/**
 * The request-fixture specs have no browser to run the Firebase SDK in, so
 * they exchange the debug token for a real App Check token themselves, over
 * the same REST endpoint the SDK uses, and send it as the App Check header.
 *
 * Needs the staging project id and the staging web app's appId, because the
 * exchange is addressed per app. Exchanged once per process and cached; the
 * token lives an hour, far longer than a spec run.
 */
let exchangedHeader: Promise<Record<string, string>> | null = null;

export function appCheckHeader(): Promise<Record<string, string>> {
  exchangedHeader ??= exchangeDebugToken();
  return exchangedHeader;
}

async function exchangeDebugToken(): Promise<Record<string, string>> {
  const debugToken = process.env.E2E_APPCHECK_DEBUG_TOKEN?.trim();
  const projectId = process.env.E2E_FIREBASE_PROJECT_ID?.trim();
  const appId = process.env.E2E_FIREBASE_APP_ID?.trim();

  if (!debugToken) return {};
  if (!projectId || !appId) {
    throw new Error(
      "E2E_APPCHECK_DEBUG_TOKEN is set but E2E_FIREBASE_PROJECT_ID or " +
        "E2E_FIREBASE_APP_ID is missing: the debug token cannot be exchanged " +
        "for an App Check token without both."
    );
  }

  const url =
    `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}` +
    `/apps/${appId}:exchangeDebugToken`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ debugToken, limitedUse: false }),
  });

  if (!response.ok) {
    throw new Error(
      `App Check debug token exchange failed (HTTP ${response.status}; ` +
        "is the token registered under App Check → Debug tokens, and is the " +
        "project id / app id the staging app's?)"
    );
  }

  const body = (await response.json()) as { token?: string };
  if (!body.token) {
    throw new Error("App Check debug token exchange returned no token.");
  }

  // Lowercase: the header name the server reads is case-insensitive, but
  // consistency with the client's own header keeps the logs greppable.
  return { "x-firebase-appcheck": body.token };
}
