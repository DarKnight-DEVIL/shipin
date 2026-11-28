/**
 * k6 scenario for ShipIN's public surface.
 *
 * The same scenario as `load.mjs`, for when k6 is available (it gives better
 * metrics, thresholds and a real VU scheduler). Thresholds fail the run rather
 * than print a number nobody reads:
 *
 *   - p95 under 800ms for the public pages,
 *   - error rate under 1%,
 *   - everything else reported for the record.
 *
 * Usage, against a locally started production build only:
 *
 *   k6 run apps/web/scripts/load/k6.js
 *   BASE_URL=https://staging.example k6 run apps/web/scripts/load/k6.js   # staging, with approval
 *
 * Never against production without explicit approval: it is a real burst of
 * traffic from one IP, and the rate limiters will (correctly) start refusing.
 */

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

export const options = {
  scenarios: {
    // Ramp so the first seconds measure a cold instance, not a warm one.
    public_surface: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "10s", target: 20 },
        { duration: "30s", target: 20 },
        { duration: "10s", target: 40 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:home}": ["p(95)<800"],
    "http_req_duration{endpoint:health}": ["p(95)<300"],
  },
};

export default function () {
  const home = http.get(`${BASE}/`, { tags: { endpoint: "home" } });
  check(home, { "home 200": (r) => r.status === 200 });

  const health = http.get(`${BASE}/api/health`, {
    tags: { endpoint: "health" },
  });
  check(health, { "health 200": (r) => r.status === 200 });

  const robots = http.get(`${BASE}/robots.txt`, {
    tags: { endpoint: "robots" },
  });
  check(robots, { "robots 200": (r) => r.status === 200 });

  sleep(1);
}
