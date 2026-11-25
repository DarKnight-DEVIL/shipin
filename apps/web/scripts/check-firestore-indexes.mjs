#!/usr/bin/env node
/**
 * Fails when a Firestore query needs a composite index that
 * `firestore.indexes.json` does not declare.
 *
 * Why this exists: the dashboard list (`where('userId','==',…)` +
 * `orderBy('createdAt','desc')`) shipped before any index existed, so every page
 * load failed with FAILED_PRECONDITION and the only way to find out was to load
 * the page and read the console. A missing index is a *static* fact about the
 * code and the index file, so it can be caught before deploy.
 *
 * The rule Firestore applies, measured against this project's Firestore on
 * 2026-11-15 rather than assumed:
 *   - filters with no ordering are answered by the automatic single-field
 *     indexes: `notifications` with `userId ==` + `read ==` returns rows, as does
 *     `requests` with `tracking.internalTrackingId ==`, and `shipments` with
 *     `__name__ in [...]` (a document-id query);
 *   - the same filters plus `orderBy('read')` fail with FAILED_PRECONDITION, so a
 *     composite index is required as soon as a filter is combined with an order;
 *   - an order on its own is served by the automatic single-field index too.
 * Hence an index is required only when at least one filter is combined with an
 * order (or a range filter, which Firestore sorts by that field).
 *
 * How it reads the source: a tiny argument reader, not one regex over the file
 * (see `lib/firestore-indexes.mjs`, which also carries the tests).
 *   - `collection(db, 'x')`, `adminDb.collection('x')` and `.collection('x')`
 *     are the anchors; a query's filters attach to the nearest anchor above it;
 *   - `where('field', 'op', …)` contributes an equality filter (`==`, `in`,
 *     `array-contains`…) or a range (`<`, `>=`, `!=`, `not-in`…);
 *   - `orderBy('field', 'desc')` contributes the ordering;
 *   - comments are blanked first, so a docblock quoting a query is not a query.
 * Arguments that are variables rather than string literals cannot be read, so
 * they are reported as unverified instead of being guessed at.
 *
 * Usage:
 *   node scripts/check-firestore-indexes.mjs            # gate (exit 1 if missing)
 *   node scripts/check-firestore-indexes.mjs --print    # show what it derived
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  indexCovers,
  readQueries,
  requirementsFor,
} from "./lib/firestore-indexes.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const INDEX_FILE = path.resolve(ROOT, "..", "..", "firestore.indexes.json");
const SOURCE_ROOTS = ["src"];
const SKIP_DIRS = new Set(["node_modules", ".next", "coverage"]);

const print = process.argv.includes("--print");
const out = (line = "") => process.stdout.write(`${line}\n`);

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...collectFiles(path.join(dir, entry.name)));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

if (!existsSync(INDEX_FILE)) {
  console.error(`check-firestore-indexes: ${INDEX_FILE} is missing`);
  process.exit(1);
}

const indexDocument = JSON.parse(readFileSync(INDEX_FILE, "utf8"));
const indexes = Array.isArray(indexDocument.indexes)
  ? indexDocument.indexes
  : [];

const allSources = SOURCE_ROOTS.flatMap((root) => {
  const dir = path.join(ROOT, root);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(
      `check-firestore-indexes: source root ${root} does not exist`
    );
    process.exit(1);
  }
  return collectFiles(dir);
});

const requirements = [];
const equalityOnly = [];
const singleField = [];
const documentIdOnly = [];
const unverified = [];
const seen = new Set();

for (const file of allSources) {
  const relative = path.relative(ROOT, file);
  const { sites, unverified: fileUnverified } = readQueries(
    readFileSync(file, "utf8")
  );
  unverified.push(...fileUnverified.map((entry) => `${relative}: ${entry}`));

  for (const site of sites) {
    const needed = requirementsFor(site);

    if (needed.length > 0) {
      for (const requirement of needed) {
        const key = [
          requirement.collection,
          [...requirement.equals].sort().join("+"),
          `${requirement.order.field}:${requirement.order.direction}`,
        ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        requirements.push({ ...requirement, file: relative });
      }
      continue;
    }

    if (site.equals.size > 0) {
      equalityOnly.push({ ...site, equals: [...site.equals], file: relative });
    } else if (site.orders.size > 0) {
      singleField.push({ ...site, file: relative });
    } else if (site.documentId) {
      documentIdOnly.push({ ...site, file: relative });
    }
  }
}

const missing = requirements.filter(
  (requirement) => !indexes.some((index) => indexCovers(requirement, index))
);

const label = (requirement) =>
  `${requirement.collection}: ${requirement.equals.join(" + ") || "(no filter)"} ordered by ${
    requirement.order.field
  } ${requirement.order.direction.toLowerCase()}`;

if (print) {
  out(`${allSources.length} files scanned, ${indexes.length} declared indexes`);
  out("");
  out(`composite-index requirements: ${requirements.length}`);
  for (const requirement of requirements) {
    const status = missing.includes(requirement) ? "MISS" : "ok  ";
    out(`  ${status} ${label(requirement)}  (${requirement.file})`);
  }
  out("");
  out(
    `no composite index needed: ${equalityOnly.length} filtered, ${singleField.length} ordered-only, ` +
      `${documentIdOnly.length} document-id`
  );
  for (const site of equalityOnly) {
    out(
      `  ----  ${site.collection}: ${site.equals.join(" + ")}  (${site.file})`
    );
  }
  if (unverified.length > 0) {
    out("");
    out(`unverified (argument is not a string literal): ${unverified.length}`);
    for (const entry of unverified) out(`  ????  ${entry}`);
  }
}

if (missing.length > 0) {
  console.error("");
  console.error(
    "check-firestore-indexes: these queries need a composite index that firestore.indexes.json does not declare:"
  );
  console.error("");
  for (const requirement of missing) {
    console.error(`  - ${label(requirement)}  (${requirement.file})`);
  }
  console.error("");
  console.error(
    "Add to firestore.indexes.json (then deploy with `npm run deploy:firestore`):"
  );
  console.error("");
  console.error(
    JSON.stringify(
      missing.map((requirement) => ({
        collectionGroup: requirement.collection,
        queryScope: "COLLECTION",
        fields: [
          ...requirement.equals.map((fieldPath) => ({
            fieldPath,
            order: "ASCENDING",
          })),
          {
            fieldPath: requirement.order.field,
            order: requirement.order.direction,
          },
        ],
      })),
      null,
      2
    )
  );
  process.exit(1);
}

out(
  `${requirements.length} composite-index requirements across ${allSources.length} files are declared ` +
    `(${indexes.length} indexes in firestore.indexes.json; ${equalityOnly.length} filtered queries ` +
    `need no composite index, ${singleField.length} ordered-only queries are single-field, ` +
    `${documentIdOnly.length} document-id queries use the built-in index).`
);

if (unverified.length > 0) {
  // Name the call sites. A bare count is unactionable: the reader cannot tell
  // which query the gate skipped, and "2 calls" stayed in this output for
  // weeks precisely because nobody could find them.
  out(
    `${unverified.length} call(s) could not be read: pass string literals to where()/orderBy().`
  );
  for (const entry of unverified) out(`  - ${entry}`);
}
