#!/usr/bin/env node
/**
 * Dry-run every migration against whatever Firestore the environment points
 * at — in CI, the emulator started around this script.
 *
 * Why a dry run in CI at all: a migration that does not compile, imports
 * something that moved, or queries a shape that needs a composite index fails
 * the same against an empty emulator as it would against production data —
 * and it fails here, in a pull request, instead of at 2am during a deploy.
 * An empty database exercises little of the data logic (the per-migration
 * unit tests cover that), but it proves every migration still runs.
 *
 * Each migration runs in its own child process: the runner is an executable
 * script whose `main()` starts on import, so sharing one process would mean
 * re-deriving its argument handling here. One process per migration also
 * keeps a failure's stack trace its own.
 *
 * Usage: node scripts/migrations/dry-run-all.ts
 * Exits non-zero on the first migration that fails; everything before it has
 * already run and reported.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = __dirname;
const RUNNER = join(MIGRATIONS_DIR, "migration-runner.ts");

/**
 * The same listing rule the runner applies, kept in step deliberately: the
 * runner's `main()` owns its argument handling and cannot be imported for
 * just the list without running it.
 */
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter(
    (f) =>
      f.endsWith(".ts") &&
      !f.endsWith(".test.ts") &&
      f !== "migration-runner.ts" &&
      f !== "dry-run-all.ts"
  )
  .map((f) => f.slice(0, -3))
  .sort();

if (migrations.length === 0) {
  console.log("No migrations found; nothing to dry-run.");
  process.exit(0);
}

console.log(`Dry-running ${migrations.length} migration(s):`);
for (const name of migrations) console.log(`  - ${name}`);

let failed = 0;

for (const name of migrations) {
  const result = spawnSync(process.execPath, [RUNNER, name, "--dry-run"], {
    cwd: MIGRATIONS_DIR,
    encoding: "utf8",
    stdio: "inherit",
    // Deliberately no shell: with shell:true on Windows Node joins the argv
    // array unquoted, and process.execPath (`C:\Program Files\nodejs\...`)
    // is re-split at its first space. Spawning node directly needs none of
    // that, and `firebase`-style .cmd shims are not involved here.
  });

  if (result.error || result.status !== 0) {
    console.error(
      `❌ Dry run failed for ${name}${
        result.error ? `: ${result.error.message}` : ""
      }`
    );
    failed += 1;
    break;
  }
}

if (failed > 0) {
  console.error(`\n❌ ${failed} migration(s) failed their dry run.`);
  process.exit(1);
}

console.log("\n✅ Every migration passed its dry run.");
