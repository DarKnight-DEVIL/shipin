#!/usr/bin/env node
/** Licence gate for CI: every package in the production closure must carry a
 * licence we have chosen to distribute, or a dated entry in the allowlist.
 *
 * Why this exists: `CONTRIBUTING.md` said new dependencies "should be reviewed
 * for license status", which is a promise nobody can check. Nothing did check
 * it, and the gate's first run found GPL-3.0 data (`country-state-city`) shipped
 * in the request form's client bundle — since replaced by the MIT country list
 * in `src/lib/countries.ts`. The gate is what surfaced it and what stops the
 * next one arriving unnoticed.
 *
 * Scope is the production closure — what actually ships — so build/test tooling
 * cannot drown the report. `npm run audit:gate` uses the same scope for
 * vulnerabilities, so the two gates agree on what "production" means.
 *
 * The allowlist works like `audit:gate`'s: an entry needs an expiry date and a
 * reason, and an expired entry fails the gate so an exception cannot become
 * permanent by neglect.
 *
 * Run locally: npm run check:licenses
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MISSING,
  checkLicenses,
  productionPackages,
} from "./lib/licenses.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const LOCKFILE = path.resolve(ROOT, "..", "..", "package-lock.json");

/**
 * Accepted non-permissive licences. Keep each entry specific and dated.
 *
 * A copyleft dependency shipped in a client bundle is a distribution obligation,
 * not a formality, so it needs a written decision here rather than a quiet
 * install. The gate's original entry for `country-state-city` (GPL-3.0) is gone:
 * the dataset was replaced by an MIT one.
 */
const ALLOWLIST = [
  {
    package: "@splinetool/react-spline",
    license: MISSING,
    expires: "2027-03-31",
    reason:
      "Commercial licence not declared in the published manifest. The landing hero is covered by the Spline subscription; re-confirm on renewal.",
  },
  {
    package: "@splinetool/runtime",
    license: MISSING,
    expires: "2027-03-31",
    reason:
      "Commercial licence not declared in the published manifest; same subscription as @splinetool/react-spline.",
  },
  {
    package: "limiter",
    license: MISSING,
    expires: "2027-03-31",
    reason:
      "MIT, declared in the legacy `licenses` array (transitive through firebase-admin). npm copies only a `license` string into the lockfile, so the gate cannot see it; verified in node_modules/limiter/package.json on 2026-11-21.",
  },
  {
    package: "png-js",
    license: MISSING,
    expires: "2027-03-31",
    reason:
      "No licence field in the published manifest and none in the lockfile. Upstream describes itself as MIT (a pngjs derivative); treat as unverified and replace it when the graphics/PDF path is next touched.",
  },
];

if (!existsSync(LOCKFILE)) {
  console.error(`check-licenses: ${LOCKFILE} is missing`);
  process.exit(1);
}

const lockfile = JSON.parse(readFileSync(LOCKFILE, "utf8"));
const packages = productionPackages(lockfile);

if (packages.length === 0) {
  // A lockfile we could not read must fail, not pass with an empty result.
  console.error(
    "check-licenses: no production packages found in package-lock.json. Expected lockfileVersion 2 or 3 with a `packages` map."
  );
  process.exit(1);
}

const { violations, allowed, expired } = checkLicenses(packages, {
  allowlist: ALLOWLIST,
});

const missingLicense = packages.filter((pkg) => !pkg.license).length;

console.log(
  `check-licenses: ${packages.length} production packages (${missingLicense} without a licence field), ` +
    `${allowed.length} allowlisted, ${violations.length} unallowlisted.`
);

for (const entry of allowed) {
  console.log(`  allowed ${entry.name} (${entry.license}) until ${entry.expires}`);
}

if (expired.length > 0) {
  console.error("::error::check-licenses: allowlist entries have expired:");
  for (const entry of expired) {
    console.error(`  ${entry.package} (${entry.license}) expired ${entry.expires}`);
  }
  console.error(
    "Re-review the package: upgrade to a permissive version, replace it, or re-date the entry with a reason."
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error(
    "::error::check-licenses: production dependencies with no licence decision:"
  );
  for (const pkg of violations) {
    console.error(
      `  ${pkg.name}: ${pkg.license}${pkg.optional ? " (optional)" : ""}`
    );
  }
  console.error(
    "Use a permissively licensed alternative, or add a dated allowlist entry in apps/web/scripts/check-licenses.mjs with a reason."
  );
  process.exit(1);
}

console.log("check-licenses: every production licence has a decision.");