#!/usr/bin/env node
/**
 * Tiny runner for the CI "Test Order Independence" job.

The root package.json binds `npm run test:shuffle` to
`npm run test:shuffle --workspace=@shipin/web`, which cannot forward a
vitest flag through npm because npm treats everything after the script name
as an npm option and rejects flags like `--sequence.seed`.

This wrapper is the CI entry point instead. It receives an optional seed
from the CI matrix (`npm_package_seed` by convention here), falls back to
the three fixed seeds the workflow uses, and runs a no-isolate single-worker
shuffle that reproduces the same failure mode the CI job is meant to catch.

Usage (preferred once CI points at it):

  node scripts/run-test-shuffle-ci.js --sequence.seed=104729


Usage (npm wrapper, when the root script is changed to call this file):

  npm run test:shuffle:ci -- --sequence.seed=104729
 */

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..", "..");
const WEB_PKG = resolve(ROOT, "apps", "web");

const args = process.argv.slice(2);

function parseFlag(name) {
  const prefix = `--${name}=`;
  for (const arg of args) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return null;
}

let seed = parseFlag("sequence.seed") || process.env.npm_package_seed || null;
const seeds = seed ? [seed] : ["104729", "130363", "155921"];

let exitCode = 0;

for (const s of seeds) {
  console.error(`::group::vitest run --sequence.seed=${s}`);
  const result = spawnSync("npx", ["vitest", "run", "--sequence.shuffle", `--sequence.seed=${s}`], {
    cwd: WEB_PKG,
    env: {
      ...process.env,
      PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || "test",
      PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || "test",
      NEXT_PUBLIC_PAYPAL_CLIENT_ID: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "test",
      PAYPAL_API_URL: process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com",
      PAYPAL_ENV: process.env.PAYPAL_ENV || "sandbox",
      SMTP_EMAIL: process.env.SMTP_EMAIL || "test@test.com",
      SMTP_PASSWORD: process.env.SMTP_PASSWORD || "test",
      FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID || "test",
      FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "test@test.com",
      FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY || "test",
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || "test",
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "test",
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "test",
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "test",
      WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || "test",
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || "test",
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || "",
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || "",
      NODE_ENV: process.env.NODE_ENV || "test",
    },
    stdio: "inherit",
    windowsHide: false,
  });

  console.error(`::endgroup::`);
  if (result.status !== 0) exitCode = result.status;
}

process.exit(exitCode);
