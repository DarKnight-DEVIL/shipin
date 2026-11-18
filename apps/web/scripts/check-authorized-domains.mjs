#!/usr/bin/env node
/**
 * Warn when the canonical app domain is missing from Firebase's authorized
 * domains.
 *
 * `signInWithPopup` only runs on hostnames listed under Firebase Console →
 * Authentication → Settings → Authorized domains, and a host that is not on the
 * list fails with `auth/unauthorized-domain` — after the deploy, for every user,
 * with no build-time signal. The login page can only apologise for it. This
 * reads the same list the console shows and says so before anyone tries.
 *
 * Scope: only the canonical domain (`NEXT_PUBLIC_APP_URL`, else
 * `SITE_URL_FALLBACK`) is checked. Preview hosts are per-branch and are added by hand; see
 * DEPLOYMENT.md → "Firebase Auth on preview deployments".
 *
 * Exit codes:
 *   0 — the canonical domain is authorized
 *   0 — credentials or project are not configured, so nothing was checked
 *       (the message says so; a missing token must not fail a local run)
 *   1 — the canonical domain is missing, or the list could not be read
 *
 * Usage:
 *   FIREBASE_ACCESS_TOKEN="$(gcloud auth print-access-token)" \
 *   FIREBASE_PROJECT_ID=shipin-9576a \
 *     node scripts/check-authorized-domains.mjs
 *
 * Environment:
 *   FIREBASE_ACCESS_TOKEN        token with the cloud-platform scope
 *   FIREBASE_PROJECT_ID          defaults to GCLOUD_PROJECT / NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_APP_URL          canonical origin; defaults to siteConfig.url
 *   IDENTITY_TOOLKIT_BASE_URL    override for tests/emulators
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_BASE_URL = "https://identitytoolkit.googleapis.com";
const CONFIG_PATH = (project) => `/admin/v2/projects/${project}/config`;

const out = (line = "") => process.stdout.write(`${line}\n`);
const note = (line) => console.error(`[AuthorizedDomains] ${line}`);

/** The canonical origin, from the environment or from the app's own config. */
function resolveCanonicalHost() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;

  if (configured) return new URL(configured).hostname;

  // `@shipin/config` is TypeScript, so the fallback constant is read rather
  // than imported: one `SITE_URL_FALLBACK = 'https://...'` line is the whole
  // shape needed here.
  const configFile = path.join(ROOT, "../../packages/config/src/site.ts");
  const url = /SITE_URL_FALLBACK\s*=\s*['"]([^'"]+)['"]/
    .exec(readFileSync(configFile, "utf8"))?.[1];

  if (!url) {
    note("could not read the canonical URL from packages/config/src/site.ts; set NEXT_PUBLIC_APP_URL.");
    return null;
  }

  return new URL(url).hostname;
}

function resolveProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    null
  );
}

/**
 * An access token for the Identity Toolkit Admin API.
 *
 * The Admin SDK does not expose authorized domains, so this needs a REST token.
 * `gcloud` is the path DEPLOYMENT.md documents; CI should pass one directly.
 */
function resolveAccessToken() {
  if (process.env.FIREBASE_ACCESS_TOKEN) return process.env.FIREBASE_ACCESS_TOKEN;

  try {
    return execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const host = resolveCanonicalHost();
  const project = resolveProjectId();
  const token = resolveAccessToken();

  if (!host) process.exit(1);

  if (!project || !token) {
    out(
      `Skipped: ${!project ? "no Firebase project id" : "no access token"} configured, ` +
        `so ${host} was not checked. Set FIREBASE_PROJECT_ID and FIREBASE_ACCESS_TOKEN ` +
        "(or sign in with gcloud) to check it."
    );
    return;
  }

  const baseUrl = (process.env.IDENTITY_TOOLKIT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

  let response;

  try {
    response = await fetch(`${baseUrl}${CONFIG_PATH(project)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": project,
      },
    });
  } catch (error) {
    note(`could not reach the Identity Toolkit API: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    note(`reading the config for ${project} failed with HTTP ${response.status}.`);

    if (response.status === 401 || response.status === 403) {
      note(
        "the token needs the cloud-platform scope and access to the project " +
          "(gcloud auth print-access-token after `gcloud auth login`)."
      );
    }

    if (body) note(body.slice(0, 400));
    process.exit(1);
  }

  const config = await response.json().catch(() => ({}));
  const domains = Array.isArray(config.authorizedDomains) ? config.authorizedDomains : [];

  if (!domains.length) {
    note(`the project returned no authorized domains; ${host} cannot sign in with Google.`);
    process.exit(1);
  }

  if (domains.includes(host)) {
    out(`${host} is authorized for Google sign-in (${domains.length} domains on ${project}).`);
    return;
  }

  // A warning, not a crash: nothing is broken in the code, a console setting is
  // missing, and the fix takes one minute.
  note(`${host} is NOT in the authorized domains for ${project}.`);
  note("Google sign-in (popup and redirect) will fail with auth/unauthorized-domain.");
  note(`Authorized now: ${domains.join(", ")}`);
  note(
    "Add it in Firebase Console → Authentication → Settings → Authorized domains, " +
      "or with the read-modify-write PATCH in DEPLOYMENT.md."
  );
  process.exit(1);
}

await main();
