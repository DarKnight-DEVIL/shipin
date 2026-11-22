#!/usr/bin/env node
/**
 * Pre-deploy preflight: would a production boot accept this configuration?
 *
 * `instrumentation.register()` runs the same validator, but only once the
 * process is already starting — and on a serverless target that is every
 * function's cold start, so a missing variable surfaces as a 500 on the live
 * deployment instead of a failed release. Running it here, against the
 * environment a release will actually get, lets CI and a deploy pipeline refuse
 * the rollout while it is still a rollout.
 *
 * Usage:
 *   npm run check:production-env
 *
 * Exit codes:
 *   0 — the production configuration is complete
 *   1 — a required variable is missing (the message names it)
 *   2 — NODE_ENV is not "production", so the validator would be a no-op
 *
 * Imported relatively and run through Node's type stripping: `production.ts` is
 * the validator in a module that imports nothing, so plain Node can load it
 * without the app's path aliases — and without `index.ts`, which builds
 * `clientEnv` at load time and throws when a `NEXT_PUBLIC_*` variable is absent
 * (a container does not need those; Next inlines them at build).
 * `src/config/env/entrypoint.test.ts` enforces that chain stays resolvable.
 */
import { validateProductionRequiredEnv } from "../src/config/env/production.ts";

// The validator returns early outside production. A CI job that forgot
// NODE_ENV=production would then pass while checking nothing — the exact
// "green gate that verifies nothing" this script exists to prevent.
if (process.env.NODE_ENV !== "production") {
  console.error(
    `[ShipIN] check:production-env must run with NODE_ENV=production (got "${process.env.NODE_ENV ?? "unset"}"); ` +
      "the production-only checks would otherwise be skipped."
  );
  process.exit(2);
}

try {
  validateProductionRequiredEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

console.log(
  "[ShipIN] Production environment OK: every required variable is present."
);
