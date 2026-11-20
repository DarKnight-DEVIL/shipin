/**
 * The `standalone` contract shared by `next.config.ts`, `package.json` and
 * `scripts/prepare-standalone.mjs`.
 *
 * `output: "standalone"` is what the Docker image ships, so the traced tree is
 * the artefact that has to boot. `next start` reads `.next/` instead and warns
 * that it does not support standalone output, which made the documented
 * `npm start` exercise a different server than the image.
 *
 * Plain JavaScript on purpose: `next.config.ts` (TypeScript) and the
 * `scripts/*.mjs` build helpers both import it, and only a `.mjs` module can be
 * loaded by both without a transpiler step.
 */

/**
 * The traced server entry, relative to the app directory (`apps/web`). A
 * workspace build keeps the app under `standalone/apps/web/`, next to the
 * hoisted `node_modules` at the standalone root.
 *
 * @type {string}
 */
export const STANDALONE_SERVER_ENTRY = ".next/standalone/apps/web/server.js";

/**
 * Local test and coverage artefacts that reach the standalone tree and, from
 * there, anything built out of it. `coverage/` alone is 13 MB.
 *
 * Two consumers keep this list honest:
 *
 *   - `outputFileTracingExcludes` in `next.config.ts`, with the paths resolved
 *     from the app root as Next requires.
 *   - `scripts/prepare-standalone.mjs`, which prunes the same paths from the
 *     traced tree. That second pass is not redundant: Next resolves the tracing
 *     globs against absolute paths, so the matcher is separator-sensitive and
 *     never fires on Windows, and the `instrumentation` trace — the one that
 *     follows the project because `src/instrumentation.ts` walks `src/app/api`
 *     — is not part of the per-route exclude pass at all.
 *
 * Entries are app-relative POSIX paths, without a leading `./`: the config adds
 * that prefix, the pruner joins them with the standalone directory.
 *
 * @type {readonly string[]}
 */
export const STANDALONE_ARTEFACTS = [
  "coverage",
  "playwright-report",
  "playwright-test",
  "test-results",
  "firestore-debug.log",
];

/**
 * Environment files the tracer copies because instrumentation's directory walk
 * reads the project root. They hold real credentials.
 *
 * The Docker build context already excludes them (`.dockerignore`), so they only
 * reach an image built straight from `.next/standalone` — but that is exactly
 * the directory `npm start` serves and the one a non-Docker deploy copies. The
 * start script passes them with `--env-file-if-exists` instead, so the server
 * still sees the same values without them being copied into the artefact.
 *
 * @type {readonly string[]}
 */
export const STANDALONE_ENV_FILES = [".env", ".env.local", ".env.production"];

/** @type {readonly string[]} */
export const STANDALONE_OUTPUT_EXCLUDES = [
  ...STANDALONE_ARTEFACTS.map((artefact) =>
    artefact.endsWith(".log") ? `./${artefact}` : `./${artefact}/**/*`
  ),
  // One glob covers `.env` and every `.env.*` variant.
  "./.env*",
];
