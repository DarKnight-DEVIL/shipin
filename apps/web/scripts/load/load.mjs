#!/usr/bin/env node
/**
 * Load test runner — no extra dependencies.
 *
 * k6 is the better tool when you have it (see `k6.js` next door, which is the
 * same scenario expressed for it). This runner exists so the numbers can be
 * reproduced on a machine with nothing but Node, which is what CI runners and
 * most dev boxes are.
 *
 * What it measures, per endpoint: requests, achieved RPS, p50/p95/p99 latency,
 * and error rate (non-2xx/3xx or a transport failure). Percentiles are computed
 * from the full sample, not from a smoothed average, because averages hide the
 * tail that actually hurts users.
 *
 * Usage:
 *   node scripts/load/load.mjs --url http://localhost:3000 --duration 15 --concurrency 20
 *
 * Never point this at production without explicit approval, and never at a
 * deployment holding real customer data.
 */

import { argv } from "node:process";

function arg(name, fallback) {
  const index = argv.indexOf(`--${name}`);

  return index === -1 ? fallback : argv[index + 1];
}

const BASE = arg("url", "http://localhost:3000").replace(/\/$/, "");
const DURATION_MS = Number(arg("duration", "15")) * 1000;
const CONCURRENCY = Number(arg("concurrency", "20"));
const WARMUP = Number(arg("warmup", "3"));

/**
 * The public, read-only surface a burst of traffic would hit first.
 *
 * Deliberately unauthenticated: authenticated paths would need seeded tokens
 * and would spend Firestore reads per request, which is a different test.
 */
const ENDPOINTS = (arg("endpoints", "/,/robots.txt,/api/health") ?? "")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);

const samples = new Map(ENDPOINTS.map((path) => [path, []]));
const errors = new Map(ENDPOINTS.map((path) => [path, 0]));

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;

  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );

  return sorted[Math.max(0, index)];
}

async function hit(path) {
  const started = performance.now();

  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { "user-agent": "shipin-loadtest/1.0" },
    });

    // Drain the body so the connection is reusable.
    await response.arrayBuffer();

    if (!response.ok && response.status >= 400) {
      errors.set(path, errors.get(path) + 1);
    }
  } catch {
    errors.set(path, errors.get(path) + 1);
  }

  samples.get(path).push(performance.now() - started);
}

async function worker(deadline) {
  let i = 0;

  while (Date.now() < deadline) {
    await hit(ENDPOINTS[i % ENDPOINTS.length]);
    i += 1;
  }
}

async function run(label, durationMs) {
  for (const path of ENDPOINTS) samples.set(path, []);

  const deadline = Date.now() + durationMs;
  const started = Date.now();

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker(deadline))
  );

  const elapsed = (Date.now() - started) / 1000;

  console.log(`\n${label}: ${CONCURRENCY} concurrent, ${elapsed.toFixed(1)}s`);

  let totalRequests = 0;
  let totalErrors = 0;

  for (const path of ENDPOINTS) {
    const values = samples.get(path).slice().sort((a, b) => a - b);
    const count = values.length;
    const failed = errors.get(path);
    totalRequests += count;
    totalErrors += failed;

    console.log(
      [
        path.padEnd(16),
        `${String(count).padStart(6)} req`,
        `${(count / elapsed).toFixed(1).padStart(7)} rps`,
        `p50 ${percentile(values, 50).toFixed(1).padStart(7)}ms`,
        `p95 ${percentile(values, 95).toFixed(1).padStart(7)}ms`,
        `p99 ${percentile(values, 99).toFixed(1).padStart(7)}ms`,
        `errors ${((failed / Math.max(count, 1)) * 100).toFixed(1)}%`,
      ].join("  ")
    );
  }

  console.log(
    `total: ${totalRequests} requests, ${(totalRequests / elapsed).toFixed(1)} rps, ` +
      `${((totalErrors / Math.max(totalRequests, 1)) * 100).toFixed(2)}% errors`
  );
}

const target = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) })
  .then((response) => `${BASE} reachable (health ${response.status})`)
  .catch(() => null);

if (!target) {
  console.error(`Cannot reach ${BASE}. Build and start the app first:\n  npm run build && npm start`);
  process.exit(1);
}

console.log(target);
await run("warmup", WARMUP * 1000);
await run("load", DURATION_MS);
