# Load testing

Two runners, the same scenario: the public surface (`/`, `/robots.txt`,
`/api/health`) hit by many clients at once.

- `scripts/load/load.mjs` — dependency-free. Use it on any machine that has
  Node, including CI. Reports RPS, p50/p95/p99 and error rate per endpoint.
- `scripts/load/k6.js` — the same scenario for k6, with thresholds that fail
  the run (`p95 < 800ms` for pages, `< 300ms` for health, `< 1%` errors).

```bash
npm run build && npm start            # terminal 1
npm run test:load                     # terminal 2
npm run test:load -- --concurrency 50 --duration 30
k6 run apps/web/scripts/load/k6.js    # when k6 is installed
```

## Baseline (single Node process, Windows dev box, 2026-11-28)

| Concurrency | Throughput | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|
| 20 | 592 rps | 30–36ms | 44–51ms | 50–63ms | 0% |
| 50 | 635 rps | 69–85ms | 86–112ms | 98–139ms | 0% |

The knee is around 600–650 rps for one process on that hardware; latency
roughly doubles between 20 and 50 concurrent clients while the error rate stays
at zero, so saturation degrades rather than breaks.

These numbers cover paths that do not read Firestore. Anything that does —
`/api/requests`, `/api/admin/*`, `/api/tracking/*` on a cache miss — is bound by
Firestore latency and quota, not by this process, and needs a seeded dataset
(plus staging credentials) to measure honestly. That test is not written yet.

## Rules

- Never run against production without explicit approval: it is a real burst
  of traffic, and the rate limiters will correctly start answering 429.
- Against staging, expect the limiter to cap you. That is the system working;
  raise `OUTBOUND_*`/limiter budgets only if you are testing the budget itself.
- The harness clears its sample set per phase, so the warmup numbers are
  discarded — the first requests to a cold instance are not representative.
