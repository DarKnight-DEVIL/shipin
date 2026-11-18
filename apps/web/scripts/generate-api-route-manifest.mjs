#!/usr/bin/env node
/**
 * Regenerates `src/config/apiRoutes.generated.ts` from the real route tree.
 *
 * Usage:
 *   node scripts/generate-api-route-manifest.mjs          # write the manifest
 *   node scripts/generate-api-route-manifest.mjs --check  # fail if it is stale
 *
 * `npm run gen:api-routes` wraps the first form. Nothing runs this during
 * `next build`: the manifest is committed so a fresh checkout builds without a
 * codegen step, and `scripts/lib/api-routes.test.ts` runs the `--check` path in
 * CI so it cannot drift from the routes that actually exist.
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  MANIFEST_PATH,
  buildManifestSource,
  collectApiRoutePaths,
} from "./lib/api-routes.mjs";

const check = process.argv.includes("--check");
const expected = buildManifestSource(collectApiRoutePaths());
const relative = MANIFEST_PATH.slice(MANIFEST_PATH.indexOf("src"));
let current = null;

try {
  current = readFileSync(MANIFEST_PATH, "utf8");
} catch {
  current = null;
}

if (check) {
  if (current === expected) {
    console.log(`${relative} is up to date.`);
    process.exit(0);
  }

  console.error(
    `${relative} is stale. Run \`npm run gen:api-routes\` and commit the result.`
  );
  process.exit(1);
}

if (current === expected) {
  console.log(`${relative} is already up to date.`);
  process.exit(0);
}

writeFileSync(MANIFEST_PATH, expected);
console.log(`${relative} updated.`);
