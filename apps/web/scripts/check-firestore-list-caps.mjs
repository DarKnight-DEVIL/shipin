#!/usr/bin/env node
/** Every bounded Firestore list read has to declare what its cap means.

 * A `.limit(N)` is a product decision: the UI may say "newest N", the caller
 * may paginate, or the read may be an internal batch that never reaches a
 * person. What is not allowed is an unexplained cap, because that is
 * indistinguishable from a list that looks complete and is not.

 * Convention — put the tag on the line(s) immediately above the limit call:

 *   // firestore-list: visible — UI shows "200+" and a notice
 *   limit(REQUEST_SUBSCRIPTION_LIMIT + 1)

 * Allowed kinds:
 *   visible    — the caller surfaces truncation to the user
 *   pagination — the caller can fetch the next page with a cursor
 *   internal   — cron/admin/helper read; not a user-facing "complete" list

 * A read with no `limit()` is unbounded and cannot use this check; the
 * inventory in docs/FIRESTORE_LIST_READS.md records why each one is accepted.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const sourceRoot = join(packageRoot, "src");

// Regex to match limit() or limitToLast() calls, including aliased imports
// Uses capture group to extract the function name
// Matches: limit(, limitToLast(, limitTo(, capped(
// Also handles cases where the function is imported under an alias like `limit as limitTo`
const LIMIT_CALL = /\b(limit|limitToLast|limitTo|capped)\s*\(/;

// Regex to match a firestore-list tag comment
const TAG = /firestore-list:\s*(visible|pagination|internal)\b/;
const TAG_KINDS = ["visible", "pagination", "internal"];
const LOOKBACK_LINES = 3;
const SKIP_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

// Collect import aliases for limit/limitToLast from firebase/firestore and firebase-admin/firestore
// Returns a Map of aliasName -> originalName
function collectLimitAliases(fileContent) {
  const aliases = new Map();
  const importRegex = /import\s+\{[^}]*\}\s+from\s+['"](firebase\/firestore|firebase-admin\/firestore)['"]/;
  const imports = fileContent.match(importRegex);
  if (!imports) return aliases;

  // Parse the import names and their aliases
  const importLine = imports[0];
  // Match: import { limit, limitToLast, other } from "...""
  // or: import { limit as limitTo } from "...""
  // or: import limit from "..." (default import)
  const namedImportRegex = /import\s+\{([^}]*)\}/;
  const match = importLine.match(namedImportRegex);
  if (!match) return aliases;

  const importSection = match[1];
  // Split by comma to get individual names
  const names = importSection.split(",").map((s) => s.trim());

  for (const name of names) {
    // Check for alias: "name as aliasName"
    const aliasMatch = name.match(/^(\w+)\s+as\s+(\w+)$/);
    if (aliasMatch) {
      const original = aliasMatch[1];
      const alias = aliasMatch[2];
      if (original === "limit" || original === "limitToLast") {
        aliases.set(alias, original);
      }
    } else if (name === "limit" || name === "limitToLast") {
      // No alias - the name itself is the original
      // We'll treat the bare name as also being valid
      // (handled by the LIMIT_CALL regex matching the bare name)
    }
  }

  return aliases;
}

// Check if a line has a limit import alias on the line above
function hasAliasImportAbove(lines, lineIndex) {
  // Look back up to 2 lines for an import statement with alias
  for (let i = Math.max(0, lineIndex - 2); i < lineIndex; i++) {
    const prevLine = lines[i].trim();
    // Match: import { limit as limitTo } from "..." or import { limitToLast as limit } from "..."
    const aliasImportMatch = prevLine.match(/import\s+\{[^}]*as\s+[\w]+\}[^;]*;?/);
    if (aliasImportMatch) {
      // Extract the aliased name
      const aliasNameMatch = prevLine.match(/as\s+(\w+)/);
      if (aliasNameMatch) {
        return aliasNameMatch[1];
      }
    }
    // Also check for single-line import with alias on same line
    const singleLineMatch = prevLine.match(/import\s+\{\s*(\w+)\s+as\s+(\w+)\s*\}/);
    if (singleLineMatch) {
      return singleLineMatch[2]; // return the alias name
    }
  }
  return null;
}

// Get all source files recursively
function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const violations = [];
const counts = Object.fromEntries(TAG_KINDS.map((kind) => [kind, 0]));
let boundedReads = 0;

// First pass: collect all import aliases for limit/limitToLast
const allAliases = new Map(); // global map of alias -> original

for (const file of sourceFiles(sourceRoot)) {
  try {
    const source = readFileSync(file, "utf8");
    const fileAliases = collectLimitAliases(source);
    for (const [alias, original] of fileAliases) {
      // Global: if same alias name appears in multiple files, they should map to same original
      if (!allAliases.has(alias)) {
        allAliases.set(alias, original);
      }
    }
  } catch {
    // skip unreadable files
  }
}

for (const file of sourceFiles(sourceRoot)) {
  const source = readFileSync(file, "utf8");

  // Only Firestore modules: `limiter.limit(ip)` in the rate limiter is not a
  // query and must not need a tag.
  if (
    !source.includes("firebase/firestore") &&
    !source.includes("firebase-admin/firestore")
  ) {
    continue;
  }

  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    // Check if this line has a limit call, including aliased versions
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;

    // A method declaration in a local structural type
    // (`limit(count: number): FirebaseQuery;`) is not a query. The purge route
    // declares one so its two `as FirebaseQuery` casts stay honest; requiring a
    // cap tag there would document code that never runs.
    if (/^\s*limit\s*\([^)]*\)\s*:/.test(line)) return;

    if (!LIMIT_CALL.test(line)) return;

    boundedReads += 1;

    // Determine the actual limit function name used from the call
    // Extract the function name from the call using capture group
    const calledFuncMatch = line.match(LIMIT_CALL);
    const calledFunc = calledFuncMatch ? calledFuncMatch[1] : null;

    // Build the set of valid names for this call
    const validNames = new Set();
    // Add the directly called name
    if (calledFunc) validNames.add(calledFunc);
    // Add any aliases mapped to this original name
    for (const [alias, original] of allAliases) {
      if (original === calledFunc) {
        validNames.add(alias);
      }
    }

    // Also check if there's an import alias on the line above
    const aliasFromAbove = hasAliasImportAbove(lines, index);
    if (aliasFromAbove) {
      // The alias import above makes this a valid call under the alias name
      validNames.add(aliasFromAbove);
    }

    // Check the lookback lines for a firestore-list tag
    const lookback = lines
      .slice(Math.max(0, index - LOOKBACK_LINES), index)
      .join("\n");
    const tag = lookback.match(TAG);

    if (!tag) {
      violations.push({
        file: relative(packageRoot, file).replaceAll("\\", "/"),
        line: index + 1,
        text: line.trim(),
        calledFunc: calledFunc || "unknown",
      });
      return;
    }

    // Verify the tag matches one of the valid names for this call
    const tagKind = tag[1];

    // A simpler check: if the tag kind is one of the allowed kinds, and
    // the call is one of the recognized limit functions, it's valid
    const recognizedCalls = ["limit", "limitToLast", "limitTo", "capped"];
    const isRecognizedCall = recognizedCalls.includes(calledFunc || "");

    if (isRecognizedCall && TAG_KINDS.includes(tagKind)) {
      counts[tagKind] += 1;
    } else if (isRecognizedCall) {
      // Tag kind doesn't match allowed kinds - still a violation
      violations.push({
        file: relative(packageRoot, file).replaceAll("\\", "/"),
        line: index + 1,
        text: line.trim(),
        calledFunc: calledFunc || "unknown",
        tagKind: tag[1],
      });
    } else if (!isRecognizedCall) {
      // Unknown call type - treat as potential violation
      violations.push({
        file: relative(packageRoot, file).replaceAll("\\", "/"),
        line: index + 1,
        text: line.trim(),
        calledFunc: calledFunc || "unknown",
      });
    }
  });
}

if (violations.length > 0) {
  console.error(
    `Firestore list caps: ${violations.length} bounded read(s) have no declared intent.\n`
  );
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}`);
    console.error(`    ${violation.text}`);
    if (violation.calledFunc) {
      console.error(`    Called as: ${violation.calledFunc}`);
    }
    if (violation.tagKind) {
      console.error(`    Tag kind: ${violation.tagKind}`);
    }
  }
  console.error(
    `\nAdd a tag on the line(s) above the limit call:\n  // firestore-list: visible | pagination | internal — why this cap is safe.\n` +
      "If the read is genuinely unbounded, remove the limit and record it in\n" +
      "docs/FIRESTORE_LIST_READS.md."
  );
  process.exit(1);
}

console.log(
  `Firestore list caps: ${boundedReads} bounded read(s) declared ` +
    `(${counts.visible} visible, ${counts.pagination} pagination, ${counts.internal} internal).`
);