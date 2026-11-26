#!/usr/bin/env node
/**
 * Fail when a browser module reads `users/{uid}` directly.
 *
 * The profile is served as a projection from `GET /api/profile` because
 * `users/{uid}` also carries server-owned fields — today the legacy TOTP secret
 * fields during a migration, tomorrow whatever the next one adds. A direct
 * client read bypasses that projection, and firestore.rules only blocks it
 * while a legacy secret happens to be present, so the bypass would be silent
 * for every account that has already been migrated.
 *
 * What counts as a violation: a module that imports the *client* Firestore SDK
 * (`firebase/firestore`) and builds a path whose first segment is `users` with
 * nothing between it and the document — `doc(db, "users", uid)`,
 * `doc(collection(db, "users"), uid)`, `doc(db, \`users/${uid}\`)`, or a list
 * over `collection(db, "users")`.
 *
 * Deliberately allowed:
 *   - `users/{uid}/addresses/...` (`collection(db, "users", uid, "addresses")`,
 *     `doc(db, "users", uid, "addresses", id)`): a subcollection with its own
 *     rules, not the profile.
 *   - Server modules: anything under `src/app/api/**`, or importing
 *     `server-only` / `firebase-admin`. They read through the Admin SDK, which
 *     bypasses rules, and never ship to the browser.
 *   - `*.test.*` and `src/test/**`.
 *
 * Usage:
 *   node scripts/check-user-profile-direct-reads.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC = path.join(ROOT, "src");

const SKIP_DIRS = new Set(["node_modules", ".next", "coverage"]);

const CLIENT_SDK = /(?:from\s+|import\s*\(\s*)["']firebase\/firestore["']/;
const SERVER_ONLY = /["']server-only["']|firebase-admin/;

const out = (line = "") => process.stdout.write(`${line}\n`);

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...collectFiles(path.join(dir, entry.name)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.d\.ts$/.test(entry.name)) continue;

    const relative = path
      .relative(ROOT, path.join(dir, entry.name))
      .split(path.sep)
      .join("/");

    if (relative.startsWith("src/app/api/")) continue;
    if (relative.startsWith("src/test/")) continue;

    files.push(relative);
  }

  return files;
}

/**
 * Every `doc(` / `collection(` call in the file, with its top-level arguments.
 *
 * Parsed rather than regex-matched on the argument list: a first attempt with a
 * regex could not see through `doc(db, "users", uid.trim())` and would have
 * reported the file as clean.
 */
function pathCalls(source) {
  const calls = [];
  const pattern = /\b(doc|collection)\s*\(/g;
  let match;

  while ((match = pattern.exec(source))) {
    const start = match.index + match[0].length;
    let depth = 1;
    let index = start;

    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      index += 1;
    }

    calls.push({
      name: match[1],
      index: match.index,
      args: topLevelArgs(source.slice(start, index - 1)),
    });
  }

  return calls;
}

/** Split a call's argument text on commas that are not nested or quoted. */
function topLevelArgs(text) {
  const args = [];
  let depth = 0;
  let quote = null;
  let escaped = false;
  let current = "";

  for (const character of text) {
    if (quote) {
      current += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      current += character;
      continue;
    }

    if (character === "(" || character === "[" || character === "{") depth += 1;
    if (character === ")" || character === "]" || character === "}") depth -= 1;

    if (character === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function isHandle(argument) {
  return (
    typeof argument === "string" &&
    argument.length > 0 &&
    !argument.startsWith('"') &&
    !argument.startsWith("'") &&
    !argument.startsWith("`")
  );
}

function literalValue(argument) {
  if (typeof argument !== "string") return null;
  const quoted = argument.match(/^["']([^"']*)["']$/);
  if (quoted) return quoted[1];
  const template = argument.match(/^`([^`]*)`$/);
  if (template) return template[1];
  return null;
}

/** A collection path given as a nested `collection(...)` call, e.g. doc(collection(db, "users"), uid). */
function nestedCollectionPath(argument) {
  if (typeof argument !== "string") return null;
  const match = argument.match(/^collection\s*\(([\s\S]*)\)$/);
  if (!match) return null;
  return topLevelArgs(match[1]).slice(1);
}

/**
 * Why this call reads the profile document, or null when it is allowed.
 *
 * A Firestore document path has an even number of segments; a collection path
 * has an odd one. So `users/<uid>` (two segments) is the profile, while
 * `users/<uid>/addresses/<id>` (four) is a subcollection document.
 */
function violation(call) {
  if (call.args.length < 2) return null;
  if (!isHandle(call.args[0])) return null;

  const nested = nestedCollectionPath(call.args[0]);
  if (nested) {
    const segments = [...nested, ...call.args.slice(1)];
    if (call.name === "doc" && segments.length === 2 && literalValue(segments[0]) === "users") {
      return "doc(collection(db, \"users\"), …)";
    }
    return null;
  }

  const segments = call.args.slice(1);
  const first = literalValue(segments[0]);

  if (first === "users") {
    if (call.name === "doc" && segments.length === 2) {
      return 'doc(db, "users", …)';
    }
    if (call.name === "collection" && segments.length === 1) {
      return 'collection(db, "users")';
    }
    return null;
  }

  // Legacy string path: doc(db, `users/${uid}`)
  if (first !== null && first.startsWith("users/") && !first.slice(6).includes("/")) {
    return "doc(db, `users/…`)";
  }

  return null;
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

const files = collectFiles(SRC);
let clientFiles = 0;
const findings = [];

for (const file of files) {
  const source = readFileSync(path.join(ROOT, file), "utf8");

  if (SERVER_ONLY.test(source)) continue;
  if (!CLIENT_SDK.test(source)) continue;

  clientFiles += 1;

  for (const call of pathCalls(source)) {
    const reason = violation(call);
    if (!reason) continue;

    findings.push({
      file,
      line: lineNumber(source, call.index),
      reason,
    });
  }
}

out(`${clientFiles} client Firestore modules scanned`);

if (clientFiles === 0) {
  // A renamed or restructured source tree would make this gate scan nothing and
  // pass, which is the failure mode a guard must not have.
  console.error(
    "check-user-profile-direct-reads: no module importing firebase/firestore was found under " +
      `${path.relative(ROOT, SRC)}. Update SRC if the source layout moved.`
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error("");
  console.error(
    "check-user-profile-direct-reads: these browser modules read users/{uid} directly:"
  );

  for (const finding of findings) {
    console.error(`  - ${finding.file}:${finding.line} (${finding.reason})`);
  }

  console.error("");
  console.error(
    "Read the profile through GET /api/profile instead: it returns the safe projection " +
      "(src/lib/userProfile.ts) and migrates server-owned fields first. Subcollections " +
      "such as users/{uid}/addresses are unaffected."
  );
  process.exit(1);
}

out("No client module reads users/{uid} directly.");
