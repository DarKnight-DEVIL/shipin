#!/usr/bin/env node
/**
 * Data-bound load test: seeded Firestore emulator + the standalone server.
 *
 * `load.mjs` measures paths that never touch the database. This one measures
 * the paths that do, which is where the real ceiling sits: a tracking page
 * resolves a request document (and the carrier sync behind it), so its
 * throughput is Firestore latency plus whatever the lookup cache absorbs.
 *
 * Run through the emulator so nothing here can touch a real project:
 *
 *   npm run test:load:data
 *
 * The script is the command `emulators:exec` runs. It seeds one shipment,
 * boots `.next/standalone/apps/web/server.js` on :3210 in development mode
 * (development, deliberately: the production preflight refuses to start
 * without deployment secrets that a load test has no business holding, and the
 * rate limiter is disabled for the run so the ceiling measured is the database
 * read path, not 429s), measures, and tears the server down.
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const PROJECT_ID = "shipin-e2e";
// A modern random id: those authorise themselves, while a legacy sequential id
// (SHP-YYYY-NNNNNN) needs a signed ?token= and would only 404 here.
const TRACKING_ID = "SHP-7QG4M2XK9TBZP3RN";
const REQUEST_ID = "load-test-request";

const CONCURRENCY = process.env.LOAD_CONCURRENCY ?? "20";
const DURATION = process.env.LOAD_DURATION ?? "10";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST is not set. Run this through `npm run test:load:data`."
  );
  process.exit(1);
}

process.env.GOOGLE_CLOUD_PROJECT ??= PROJECT_ID;

/* ------------------------------------------------------------------ seed -- */

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore, Timestamp } = await import("firebase-admin/firestore");

initializeApp({ projectId: PROJECT_ID });

const db = getFirestore();

const now = Date.now();

await db.collection("requests").doc(REQUEST_ID).set({
  trackingId: TRACKING_ID,
  status: "shipped",
  createdAt: new Date(now - 5 * 86_400_000),
  statusHistory: { shipped: new Date(now - 4 * 86_400_000) },
  tracking: {
    internalTrackingId: TRACKING_ID,
    carrier: "India Post",
    trackingNumber: "EE123456789IN",
    // No recent sync: the resolver then answers from the stored document,
    // which is what a real poll does between carrier syncs.
    lastSyncedAt: Timestamp.fromMillis(now),
    events: [
      {
        code: "SHIPPED",
        description: "Shipment handed to the carrier",
        occurredAt: new Date(now - 20 * 3_600_000).toISOString(),
        location: "Mumbai",
      },
    ],
  },
});

console.log(`seeded ${REQUEST_ID} with tracking id ${TRACKING_ID}`);

/* ---------------------------------------------------------------- server -- */

const server = spawn(
  "node",
  [
    // Same env loading as `npm start`: the preflight requires the deployment's
    // variable names even when their values come from a developer's file, and
    // `--env-file` never overrides a variable this script already set (so the
    // emulator host and the waivers below still win).
    "--env-file-if-exists=.env",
    "--env-file-if-exists=.env.local",
    ".next/standalone/apps/web/server.js",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(PORT),
      // The proxy's limiter answers 429 partway through any real burst; this
      // run measures the read path, not the budget. Since the switch needs its
      // own acknowledgement on a production build, that is set too — the first
      // version of this script forgot it and measured 429s.
      RATE_LIMIT_DISABLED: "1",
      E2E_RATE_LIMITS_DISABLED_ACK: "1",
      // The same documented E2E waivers `scripts/e2e-local.mjs` sets. The
      // standalone server boots with production guards even under
      // NODE_ENV=development, and every one of them refuses an emulator (by
      // design) — this run is an emulator on purpose.
      EMULATOR_GUARD_OPTIONAL: "1",
      ALERT_WEBHOOK_OPTIONAL: "1",
      RATE_LIMIT_STORE_OPTIONAL: "1",
      APP_URL_E2E_OPTIONAL: "1",
      MFA_DENYLIST_OPTIONAL: "1",
      APP_CHECK_ENFORCEMENT: "false",
      // `.env.local` pins the live project id; the emulator namespaces by
      // project, and the seeder wrote under `shipin-e2e`, so the server must
      // read the same one.
      FIREBASE_ADMIN_PROJECT_ID: PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
      APP_URL: BASE,
      NEXT_PUBLIC_APP_URL: BASE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let serverLog = "";

server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

const shutdown = () => {
  if (!server.killed) server.kill("SIGTERM");
};

process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

async function waitForServer(timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) return;
    } catch {
      /* not up yet */
    }

    await sleep(500);
  }

  console.error("server did not become ready:\n" + serverLog.slice(-2000));
  process.exit(1);
}

await waitForServer();

/* ------------------------------------------------------------------ load -- */

function run(args, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn("node", args, { env, stdio: "inherit" });

    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const endpoints = [
  `/api/tracking/${TRACKING_ID}`, // data-bound: request lookup (+ cache)
  "/api/health", // store fan-out
  "/", // static page, for comparison
].join(",");

const code = await run([
  "scripts/load/load.mjs",
  "--url",
  BASE,
  "--endpoints",
  endpoints,
  "--concurrency",
  CONCURRENCY,
  "--duration",
  DURATION,
  "--warmup",
  "3",
]);

shutdown();

console.log(
  code === 0
    ? "\ndata-bound load test complete"
    : `\ndata-bound load test failed (exit ${code})`
);

process.exit(code);
