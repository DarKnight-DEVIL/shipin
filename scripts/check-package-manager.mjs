#!/usr/bin/env node
/**
 * Refuse to install the workspace with anything but npm.
 *
 * This is an npm workspace: `package-lock.json` is the only lockfile that is
 * kept, `packageManager` pins npm 12.2.2, and CI restores the npm cache and
 * installs with `npm ci`. A stray `yarn` or `pnpm install` writes a second
 * lockfile plus a different `node_modules` layout, and the hoisted resolution
 * the app relies on does not survive that: the next `npm ci` then "fixes" a
 * tree nobody can reproduce, or silently installs different versions.
 *
 * Wired as the root `preinstall`, so the message arrives before anything is
 * written. Every package manager sets `npm_config_user_agent` while running
 * lifecycle scripts ("npm/12.2.2 node/v22.12.0 win32 x64 workspaces/false").
 * When it is absent — a direct `node scripts/check-package-manager.mjs`, or a
 * wrapper that strips it — there is nothing to infer, so the check stays quiet
 * rather than blocking an install it cannot identify.
 */
import { pathToFileURL } from "node:url";

/**
 * The manager that must not install here, or null when the run is npm's.
 *
 * @param {string | undefined} userAgent
 * @returns {string | null}
 */
export function offendingPackageManager(userAgent) {
  if (!userAgent) return null;

  const [name] = userAgent.split("/");
  return name === "npm" ? null : name;
}

/**
 * @param {string} manager
 * @returns {string}
 */
function refusal(manager) {
  return [
    `This repository is installed with npm, not ${manager}.`,
    "",
    "package-lock.json is the only lockfile that is kept. A second one written",
    "here changes how the workspace resolves, and nothing in CI reads it.",
    "",
    `Remove what ${manager} created (its lockfile and node_modules), then:`,
    "",
    "  npm ci",
    "",
    "The npm version is pinned by `packageManager` in package.json; run",
    "`corepack enable` once to have it used automatically.",
  ].join("\n");
}

// Only act when this file is the entrypoint: the test suite imports
// `offendingPackageManager` while npm is the runner, and a top-level exit here
// would take the whole suite down if it were ever launched by another manager.
const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (entrypoint === import.meta.url) {
  const offending = offendingPackageManager(process.env.npm_config_user_agent);

  if (offending) {
    console.error(refusal(offending));
    process.exit(1);
  }
}
