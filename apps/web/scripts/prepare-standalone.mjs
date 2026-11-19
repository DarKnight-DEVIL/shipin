#!/usr/bin/env node
/**
 * Make the traced standalone tree serveable, so `npm start` boots exactly what
 * the Docker image boots.
 *
 * `output: "standalone"` puts a minimal `server.js` and its traced
 * `node_modules` in `.next/standalone/apps/web/`, but deliberately leaves
 * `public/` and `.next/static/` out — static assets are not traced. The
 * Dockerfile performs those two copies itself
 * (`COPY apps/web/public ./apps/web/public`,
 * `COPY apps/web/.next/static ./apps/web/.next/static`). This script is the
 * local equivalent, and it runs twice on purpose: `build` calls it right after
 * `next build` so the artefact is serveable however it is started, and
 * `prestart` runs it again before `npm start`. The second pass matters because
 * `prestart` is an npm lifecycle hook: a container or a supervisor that runs
 * `server.js` directly never triggers it.
 *
 * It also prunes what the tracer drags in and must not ship: the test/coverage
 * artefacts (see `STANDALONE_ARTEFACTS`) and the environment files, which hold
 * real credentials (`STANDALONE_ENV_FILES`). `npm start` loads those with
 * `--env-file-if-exists` from the app directory instead.
 *
 * It is idempotent: both copy destinations are replaced, never merged, so a
 * rebuild cannot leave a previous build's hashed chunks behind.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STANDALONE_ARTEFACTS,
  STANDALONE_ENV_FILES,
} from "../standalone-output-excludes.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneAppDir = path.join(
  appDir,
  ".next",
  "standalone",
  "apps",
  "web"
);

if (!existsSync(path.join(standaloneAppDir, "server.js"))) {
  console.error(
    [
      "No standalone build found.",
      "",
      `Expected ${path.relative(appDir, path.join(standaloneAppDir, "server.js"))}.`,
      "Run `npm run build` first: `npm start` serves the traced build, it does not create it.",
    ].join("\n")
  );
  process.exit(1);
}

const copies = [
  {
    from: path.join(appDir, "public"),
    to: path.join(standaloneAppDir, "public"),
  },
  {
    from: path.join(appDir, ".next", "static"),
    to: path.join(standaloneAppDir, ".next", "static"),
  },
];

for (const { from, to } of copies) {
  // `public/` is optional for the app to boot; a missing one is not an error.
  // `.next/static` is always produced by a build and its absence here means the
  // build output is incomplete, so the copy below throws.
  if (!existsSync(from)) continue;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

for (const artefact of STANDALONE_ARTEFACTS) {
  rmSync(path.join(standaloneAppDir, artefact), {
    recursive: true,
    force: true,
  });
}

for (const envFile of STANDALONE_ENV_FILES) {
  rmSync(path.join(standaloneAppDir, envFile), { force: true });
}
