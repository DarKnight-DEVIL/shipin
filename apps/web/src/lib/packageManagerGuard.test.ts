/**
 * Tests for the npm-only install guard (`scripts/check-package-manager.mjs`).
 *
 * The guard exists because a second lockfile changes how the workspace
 * resolves, so the regression worth pinning is not the message: it is that a
 * non-npm lifecycle run actually fails, and that npm's run does not.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { offendingPackageManager } from "../../../../scripts/check-package-manager.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".."
);
const guardScript = path.join(
  repoRoot,
  "scripts",
  "check-package-manager.mjs"
);

type RootManifest = { scripts?: Record<string, string> };
const rootManifest = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8")
) as RootManifest;

function runGuard(userAgent: string | undefined) {
  // Windows env blocks are case-insensitive: npm sets
  // `npm_config_user_agent` for the suite, and leaving it in place next to an
  // override of the same name lets either value reach the child. Drop the
  // inherited one so this test controls the agent it is testing.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "npm_config_user_agent") delete env[key];
  }
  if (userAgent !== undefined) env.npm_config_user_agent = userAgent;

  return spawnSync(process.execPath, [guardScript], { encoding: "utf8", env });
}

describe("package manager guard", () => {
  it("is wired as the root preinstall, before anything is installed", () => {
    expect(rootManifest.scripts?.preinstall).toBe(
      "node scripts/check-package-manager.mjs"
    );
  });

  it("accepts npm and stays quiet when the manager is unknown", () => {
    expect(
      offendingPackageManager(
        "npm/12.2.2 node/v22.12.0 win32 x64 workspaces/false"
      )
    ).toBeNull();
    expect(offendingPackageManager(undefined)).toBeNull();
    expect(offendingPackageManager("")).toBeNull();
  });

  it("names the managers that would write a second lockfile", () => {
    expect(
      offendingPackageManager(
        "yarn/1.22.22 npm/? node/v22.12.0 win32 x64"
      )
    ).toBe("yarn");
    expect(
      offendingPackageManager("pnpm/9.12.0 npm/? node/v22.12.0 linux x64")
    ).toBe("pnpm");
    expect(
      offendingPackageManager("bun/1.1.34 npm/? node/v22.6.0 linux x64")
    ).toBe("bun");
  });

  it("fails a yarn install and explains what to do instead", () => {
    const result = runGuard("yarn/1.22.22 npm/? node/v22.12.0 win32 x64");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("installed with npm, not yarn");
    expect(result.stderr).toContain("npm ci");
  });

  it("does not block npm's own install", () => {
    const result = runGuard(
      "npm/12.2.2 node/v22.12.0 win32 x64 workspaces/false"
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
