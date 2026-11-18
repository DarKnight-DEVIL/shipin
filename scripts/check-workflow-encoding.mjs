#!/usr/bin/env node
/**
 * Fail when a GitHub Actions workflow file is not plain UTF-8.
 *
 * `.github/workflows/expire-quotes-cron.yml` was saved as UTF-16 with a BOM.
 * GitHub could not parse it, so the hourly cron never ran at all — no error, no
 * failed run, just an automation that silently does not exist. Encoding is not
 * something review catches, so it is checked mechanically.
 *
 * Checks, per file under .github/workflows:
 *   - no UTF-8 BOM, no UTF-16/UTF-32 BOM, no NUL bytes (a UTF-16 giveaway)
 *   - decodes as UTF-8
 *   - parses as YAML when `yaml` or `js-yaml` is resolvable, and has a jobs map
 *
 * CRLF is only a note, not a failure: the repo stores LF, but a Windows checkout
 * with core.autocrlf=true hands this script CRLF for files that are fine.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const WORKFLOW_DIR = path.resolve(".github/workflows");
const EXTENSIONS = new Set([".yml", ".yaml"]);

const require = createRequire(import.meta.url);

function loadYaml() {
  for (const name of ["yaml", "js-yaml"]) {
    try {
      return require(name);
    } catch {
      // try the next one
    }
  }
  return null;
}

const yaml = loadYaml();

function parse(source) {
  if (!yaml) return null;
  return typeof yaml.parse === "function"
    ? yaml.parse(source)
    : yaml.load(source);
}

function checkFile(file) {
  const failures = [];
  const notes = [];
  const bytes = readFileSync(file);

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    failures.push("starts with a UTF-8 BOM; save as UTF-8 without BOM");
  } else if (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  ) {
    failures.push(
      "is UTF-16; GitHub cannot parse it, so the workflow never runs"
    );
  }

  if (bytes.includes(0x00)) {
    failures.push("contains NUL bytes (UTF-16/UTF-32); save as plain UTF-8");
  }

  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    failures.push("is not valid UTF-8");
  }

  if (failures.length === 0 && text.includes("\r\n")) {
    notes.push("has CRLF line endings in this checkout (stored as LF)");
  }

  if (failures.length === 0 && yaml) {
    let parsed;
    try {
      parsed = parse(text);
    } catch (error) {
      failures.push(
        `does not parse as YAML: ${error instanceof Error ? error.message : error}`
      );
    }

    if (parsed && typeof parsed === "object" && !("jobs" in parsed)) {
      failures.push("has no `jobs:` map");
    }
  }

  return { failures, notes };
}

if (!existsSync(WORKFLOW_DIR)) {
  console.error(`No ${WORKFLOW_DIR} directory to check.`);
  process.exit(1);
}

const files = readdirSync(WORKFLOW_DIR)
  .filter((name) => EXTENSIONS.has(path.extname(name)))
  .sort();

if (files.length === 0) {
  console.error(`No workflow files found in ${WORKFLOW_DIR}.`);
  process.exit(1);
}

let failed = 0;
for (const name of files) {
  const { failures, notes } = checkFile(path.join(WORKFLOW_DIR, name));
  if (failures.length > 0) {
    failed++;
    console.error(`✗ ${name}`);
    for (const failure of failures) console.error(`    ${failure}`);
  } else {
    console.log(`✓ ${name}`);
    for (const note of notes) console.log(`    (${note})`);
  }
}

if (!yaml) {
  console.warn(
    "(YAML parsing skipped: neither `yaml` nor `js-yaml` is resolvable)"
  );
}

if (failed > 0) {
  console.error(`\n${failed} workflow file(s) are not valid UTF-8 YAML.`);
  process.exit(1);
}

console.log(`\n${files.length} workflow file(s) are valid UTF-8 YAML.`);
