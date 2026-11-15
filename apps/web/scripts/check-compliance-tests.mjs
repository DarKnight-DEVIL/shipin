#!/usr/bin/env node
/**
 * Fails when a module under `src/lib/compliance` has no colocated test file.
 *
 * Compliance code — age verification, breach notification, consent, retention,
 * data-subject rights — is the part of this app where "we wrote it" is not the
 * same as "we checked it", and where a missing test is invisible: coverage
 * thresholds are global, so one well-covered module hides a neighbour that has
 * no tests at all. A new `src/lib/compliance/*.ts` can therefore ship untested
 * while every gate stays green.
 *
 * The rule is deliberately dumb and strict: for every `foo.ts` (or `foo.tsx`)
 * in that directory there must be a `foo.test.ts` or `foo.test.tsx` beside it.
 * No allowlist, no exemptions — if a module is not worth testing, it should not
 * be in `src/lib/compliance`.
 *
 * Usage:
 *   node scripts/check-compliance-tests.mjs
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const COMPLIANCE_DIR = path.join(ROOT, "src", "lib", "compliance");

const isTestFile = (name) => /\.test\.(ts|tsx)$/.test(name);
const isModuleFile = (name) =>
  /\.(ts|tsx)$/.test(name) && !isTestFile(name) && !/\.d\.ts$/.test(name);

/** Informational output goes to stdout; failures go to stderr. */
const out = (line = "") => process.stdout.write(`${line}\n`);

/** Recursively collect compliance modules as paths relative to the directory. */
function collectModules(dir, prefix = "") {
  const modules = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      modules.push(...collectModules(path.join(dir, entry.name), relative));
      continue;
    }

    if (entry.isFile() && isModuleFile(entry.name)) modules.push(relative);
  }

  return modules;
}

if (!existsSync(COMPLIANCE_DIR)) {
  console.error(
    `check-compliance-tests: ${path.relative(ROOT, COMPLIANCE_DIR)} does not exist. ` +
      "The check is aimed at the wrong directory, so it would pass vacuously."
  );
  process.exit(1);
}

const modules = collectModules(COMPLIANCE_DIR);

if (modules.length === 0) {
  // An empty directory means the gate protects nothing, which is worse than
  // failing: it looks green while compliance code lives somewhere else.
  console.error(
    "check-compliance-tests: no modules found under src/lib/compliance. " +
      "If the subtree moved, point this script at the new location."
  );
  process.exit(1);
}

const results = modules.map((module) => {
  const absolute = path.join(COMPLIANCE_DIR, module);
  const withoutExtension = absolute.replace(/\.(ts|tsx)$/, "");
  const candidates = [`${withoutExtension}.test.ts`, `${withoutExtension}.test.tsx`];

  return { module, test: candidates.find((candidate) => existsSync(candidate)) };
});

for (const { module, test } of results) {
  const label = test ? path.basename(test) : "MISSING";
  out(`${label}\t${module}`);
}

const untested = results.filter(({ test }) => !test);

if (untested.length > 0) {
  console.error("");
  console.error(
    "check-compliance-tests: these compliance modules have no colocated test file:"
  );

  for (const { module } of untested) {
    console.error(`  - src/lib/compliance/${module}`);
  }

  console.error("");
  console.error(
    "Add `<name>.test.ts` next to each module. Global coverage thresholds do " +
      "not catch a single untested neighbour."
  );
  process.exit(1);
}

out();
out(`All ${modules.length} compliance modules have a matching test file.`);
