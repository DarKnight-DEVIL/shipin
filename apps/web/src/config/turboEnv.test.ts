// @vitest-environment node

/**
 * Turbo strips any environment variable a task uses unless it is declared in
 * `turbo.json`. The failure is quiet and it lands on the deployment, not here: the
 * first Vercel build of the CSP work warned that `MONEY_MINOR_ONLY` and
 * `APP_CHECK_ENFORCEMENT` "WILL NOT be available to your application" while the
 * build still went green, so the flags the server reads can differ between the build
 * and the run.
 *
 * A warning nobody reads is not a gate, and neither is a hand-maintained list -
 * `MONEY_MINOR_ONLY` was absent from every such list, which is exactly how it went
 * unnoticed. So this reads the names out of the SOURCE: whatever `process.env.X` and
 * `serverEnv.X` mention must be declared, or the test fails naming it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const sourceRoot = path.resolve(__dirname, "..");

/**
 * Variables that do not need declaring.
 *
 * NEXT_PUBLIC_* are covered by the wildcard in turbo.json. The rest are set by the
 * platform or by Node itself, or are only ever read by scripts outside the build.
 */
const IGNORED = new Set([
  "NODE_ENV",
  "VERCEL",
  "PORT",
  "HOSTNAME",
  "CI",
  "NEXT_RUNTIME",
  "npm_lifecycle_event",
  // Set by the platform in the function environment regardless of this list; the
  // build does not need them and Turbo must not be asked to pass them through.
  "VERCEL_BRANCH_URL",
  "VERCEL_ENV",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  // Set by the E2E runner, never present in a deployment.
  "FIRESTORE_EMULATOR_HOST",
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      found.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }

  return found;
}

/** Every env var name the source reads, in any of the shapes this codebase uses. */
function envNamesRead(): Set<string> {
  const names = new Set<string>();

  for (const file of sourceFiles(sourceRoot)) {
    const text = readFileSync(file, "utf8");

    for (const match of text.matchAll(/\b(?:process\.env|serverEnv)\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1]);
    }
    for (const match of text.matchAll(/\b(?:process\.env|serverEnv)\["([A-Z][A-Z0-9_]*)"\]/g)) {
      names.add(match[1]);
    }
  }

  return names;
}

/** A name is declared when listed exactly, or covered by a `PREFIX_*` wildcard. */
function isDeclared(globalEnv: string[], name: string): boolean {
  if (globalEnv.includes(name)) return true;

  return globalEnv.some((entry) => {
    if (!entry.endsWith("*")) return false;
    return name.startsWith(entry.slice(0, -1));
  });
}

describe("turbo.json globalEnv", () => {
  const globalEnv: string[] = JSON.parse(
    readFileSync(path.join(repoRoot, "turbo.json"), "utf8")
  ).globalEnv;

  it("declares every environment variable the app reads", () => {
    const missing = [...envNamesRead()]
      .filter((name) => !IGNORED.has(name))
      .filter((name) => !isDeclared(globalEnv, name))
      .sort();

    expect(
      missing,
      "read by the app but stripped from the build by Turbo - add them to globalEnv"
    ).toEqual([]);
  });
});
