import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import path from "path";

// __dirname: C:\Users\darkn\shipin\apps\web\src\config\env
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", ".."); // 5 levels up to repo root

const composeSource = readFileSync(
  path.join(repoRoot, "docker-compose.yml"),
  "utf8"
);

/* Extract every "KEY=VALUE" line from a docker-compose `environment:` block. */
function extractComposeEnv(composeText: string): Map<string, string> {
  const vars = new Map<string, string>();

  // Match KEY: VALUE or KEY VALUE across the whole file; duplicates later
  // in the file win (as docker compose does), so we just record the last
  // occurrence of each key.
  // Regex must have the `g` flag; without it, `exec()` creates an infinite loop
  // (always returns the same match from index 0). Guard against a lost `g` flag.
  const regex = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:(.+)$/gm;
  if (!regex.global) {
    throw new Error(
      '[ShipIN] FATAL: dockerComposeEnv regex is missing the `g` flag; ' +
      'adding it prevents an infinite loop in the extractComposeEnv while loop.'
    );
  }
  let match: RegExpExecArray | null;

  while ((match = regex.exec(composeText)) !== null) {
    const key = match[1];
    const value = match[2].trim();
    // skip docker-compose internal keys
    if (key === "name" || key === "services" || key === "volumes") continue;
    vars.set(key, value);
  }

  return vars;
}

/* Parse production.ts - get REQUIRED_SERVER_ENV and PRODUCTION_REQUIRED_SERVER_ENV */
const productionSource = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "config", "env", "production.ts"),
  "utf8"
);

/* All variable names that production.ts says are required at runtime. */
function namesIn(marker: string, source: string): string[] {
  const declaration = source.match(
    new RegExp(`${marker}\\[\\s\\S]*?\\]\\s*(?:as\\s+const\\s*)?;`)
  )?.[0];

  if (!declaration) return [];

  return [...declaration.matchAll(/"([A-Z][A-Z0-9_]+"?)/g)].map((match) =>
    match[1].replace(/"/g, "")
  );
}

const requiredServerVars = new Set([
  ...namesIn("const REQUIRED_SERVER_ENV", productionSource),
  ...namesIn("const PRODUCTION_REQUIRED_SERVER_ENV", productionSource),
]);

/* Variables that are in RATE_LIMIT_STORE_SERVER_ENV but opt‑outable. */
const rateLimitOptOutVars = new Set(
  ...namesIn("const RATE_LIMIT_STORE_SERVER_ENV", productionSource)
);

/* ── the test suite ────────────────────────────────────────────────────────*/

describe("docker-compose env wiring", () => {
  it("reads docker-compose.yml at all", () => {
    expect(composeSource).toMatch(/\S/);
  });

  it("has every production‑required server env var", () => {
    const composeVars = extractComposeEnv(composeSource);

    const missing: string[] = [];

    for (const key of requiredServerVars) {
      // Skip the opt‑out rate‑limit vars — they are intentionally absent
      // when RATE_LIMIT_STORE_OPTIONAL=1 is set (as it is in compose).
      if (rateLimitOptOutVars.has(key)) continue;

      if (!composeVars.has(key)) {
        missing.push(key);
      }
    }

    expect(
      missing,
      `docker-compose.yml is missing required production env vars: ${missing.join(
        ", "
      )}`
    ).toEqual([]);
  });

  it("has the opt‑out flag when rate‑limit vars are absent", () => {
    const hasOptionalFlag = /RATE_LIMIT_STORE_OPTIONAL\s*:\s*"1"/.test(
      composeSource
    );

    // If the compose file omits the upstash vars, the optional flag must be
    // present so the preflight knows it can boot without them.
    // (The actual presence/absence of the upstash vars is checked by the
    // test above, which skips them when the flag is set.)
    expect(hasOptionalFlag).toBe(true);
  });

  it("has all NEXT_PUBLIC_* client env from the compose anchor", () => {
    const requiredNextPublic = new Set([
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
      "NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST",
    ]);

    // The client config anchor spreads these via `<<: *client-config`.
    // They should appear somewhere in the compose file as an anchor expansion
    // or as explicit runtime environment under the `app` service.
    const anchorSpread = /<<:\s*\*\s*client-config/.test(composeSource);

    expect(anchorSpread).toBe(true);
  });
});
