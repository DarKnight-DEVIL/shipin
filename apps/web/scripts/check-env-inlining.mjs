#!/usr/bin/env node
/**
 * Build-time check: verify all NEXT_PUBLIC_* env vars are inlined.
 *
 * Next.js inlines NEXT_PUBLIC_* at build time via static analysis of
 * `process.env.NEXT_PUBLIC_*` patterns. If the code uses dynamic access
 * (e.g., `process.env[varName]`), inlining fails silently and the browser
 * sees `undefined` at runtime.
 *
 * This script scans the .next output for any remaining `process.env.NEXT_PUBLIC_`
 * references that weren't inlined.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
// `ROOT` is already `apps/web`, the workspace that owns `.next`. Repeating the
// `apps/web` segment here pointed at `apps/web/apps/web/.next`, so the check
// could never run after a clean build.
const NEXT_DIR = path.join(ROOT, ".next");

/**
 * Only the browser output is checked. Next inlines `NEXT_PUBLIC_*` into client
 * chunks; server chunks keep the runtime reads on purpose (the emulator hosts
 * are read there), so scanning `.next/server` reported six perfectly correct
 * reads as build failures.
 */
const CLIENT_DIR = path.join(NEXT_DIR, "static");

if (!existsSync(NEXT_DIR)) {
  console.error(
    "check-env-inlining: .next directory not found. Run `npm run build` first."
  );
  process.exit(1);
}

const NEXT_PUBLIC_PATTERN = /process\.env\.NEXT_PUBLIC_[A-Z0-9_]+/g;

function scanDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Skip node_modules and cache directories
      if (!["node_modules", "cache"].includes(entry.name)) {
        files.push(...scanDir(path.join(dir, entry.name)));
      }
      continue;
    }
    if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

const allFiles = scanDir(CLIENT_DIR);
let found = false;

for (const file of allFiles) {
  const content = readFileSync(file, "utf8");
  const matches = content.match(NEXT_PUBLIC_PATTERN);
  if (matches) {
    // Filter out false positives (e.g., in comments or string literals that are expected)
    // Only report actual code references
    const codeMatches = matches.filter(
      (m) =>
        // Not in a comment
        !content.includes(`// ${m}`) && !content.includes(`/* ${m}`)
    );
    if (codeMatches.length > 0) {
      console.error(
        `❌ Found NEXT_PUBLIC_ reference in ${path.relative(ROOT, file)}:`
      );
      codeMatches.forEach((m) => console.error(`   ${m}`));
      found = true;
    }
  }
}

if (found) {
  console.error(
    "\n❌ Some NEXT_PUBLIC_* variables were not inlined by Next.js."
  );
  console.error("This means they will be undefined in the browser at runtime.");
  console.error(
    "Check that they are accessed as static process.env.NEXT_PUBLIC_* properties."
  );
  process.exit(1);
} else {
  console.log("✅ All NEXT_PUBLIC_* variables appear to be properly inlined.");
}
