#!/usr/bin/env node
/**
 * Dependency audit gate for CI.
 *
 * `npm audit` is the right signal but the wrong gate on its own: a build-only
 * transitive advisory with no published fix makes the whole job red, and a red
 * job nobody can fix stops being read. This runs the production dependency view
 * (dev/build tooling excluded) at high and critical, and fails on every advisory
 * that is not on the allowlist below.
 *
 * An allowlist entry MUST have an expiry date. When it expires the gate fails
 * with an instruction to revisit it, so the exception cannot quietly become
 * permanent. Remove an entry as soon as a fixed release exists.
 *
 * Run locally: npm run audit:gate
 */

import { spawnSync } from "node:child_process";

/**
 * Accepted advisories. Keep this list short and specific.
 *
 * GHSA-fc5q-39xc-vjpf (picomatch <= 4.0.7) is reachable only through build and
 * test tooling. Checked 2026-11-18: 4.0.7 is the newest published picomatch,
 * and vite, vitest and @sentry/nextjs -> @rollup/plugin-commonjs all depend on
 * it, so there is no version to upgrade to yet.
 */
const ALLOWLIST = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    expires: "2027-01-31",
    reason:
      "Build/test tooling only (vite, vitest, @sentry/nextjs -> @rollup/plugin-commonjs); 4.0.7 is the latest published release, so no fixed version exists.",
  },
];

const today = new Date().toISOString().slice(0, 10);

const expired = ALLOWLIST.filter((entry) => entry.expires < today);
if (expired.length > 0) {
  console.error("::error::audit-gate: allowlist entries have expired:");
  for (const entry of expired) {
    console.error(
      "  " + entry.id + " (" + entry.package + ") expired " + entry.expires
    );
  }
  console.error(
    "Re-check for a fixed release, upgrade if one exists, otherwise re-date the entry."
  );
  process.exit(1);
}

const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  // npm is a .cmd shim on Windows, which spawnSync cannot execute directly.
  shell: process.platform === "win32",
});

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error(
    "::error::audit-gate: could not parse `npm audit --json` output."
  );
  console.error(audit.stderr || audit.stdout);
  process.exit(1);
}

if (
  !report ||
  typeof report.vulnerabilities !== "object" ||
  report.vulnerabilities === null
) {
  console.error(
    "::error::audit-gate: npm audit returned no vulnerability report."
  );
  console.error(audit.stderr || audit.stdout);
  process.exit(1);
}

/**
 * Advisories reachable from the vulnerable packages.
 *
 * npm publishes the advisory object on the package the advisory was filed
 * against and references it by name everywhere else, so vulns such as vite,
 * fdir or @rollup/pluginutils only carry strings. Resolving those references
 * keys the allowlist by advisory id rather than by every dependent package.
 *
 * @type {Map<string, {package: string, id: string, title: string, severity: string}>}
 */
const advisories = new Map();

function collect(name, seen = new Set()) {
  if (seen.has(name)) return;
  seen.add(name);

  const vulnerability = report.vulnerabilities[name];
  if (!vulnerability) return;

  for (const via of vulnerability.via ?? []) {
    if (typeof via === "string") {
      collect(via, seen);
      continue;
    }

    if (via.severity !== "high" && via.severity !== "critical") continue;

    const id =
      /GHSA-[a-z0-9-]+/i.exec(via.url ?? "")?.[0] ?? via.url ?? "unresolved";

    advisories.set(id, {
      package: name,
      id,
      title: via.title ?? "unknown advisory",
      severity: via.severity,
    });
  }
}

for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
  if (
    vulnerability.severity !== "high" &&
    vulnerability.severity !== "critical"
  )
    continue;
  collect(name);
}

const blocked = [...advisories.values()].filter(
  (advisory) => !ALLOWLIST.some((entry) => advisory.id.includes(entry.id))
);

console.log(
  "audit-gate: " +
    advisories.size +
    " distinct high/critical advisories in the production view, " +
    (advisories.size - blocked.length) +
    " allowlisted."
);

for (const entry of ALLOWLIST) {
  console.log(
    "  allowed " + entry.id + " (" + entry.package + ") until " + entry.expires
  );
}

if (blocked.length > 0) {
  console.error("::error::audit-gate: unallowlisted production advisories:");
  for (const advisory of blocked) {
    console.error(
      "  " +
        advisory.severity +
        " " +
        advisory.id +
        " in " +
        advisory.package +
        ": " +
        advisory.title
    );
  }
  console.error(
    "Fix, upgrade, or add a dated allowlist entry in scripts/audit-gate.mjs with a reason."
  );
  process.exit(1);
}

console.log("audit-gate: no unallowlisted high/critical advisories.");
