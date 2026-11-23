#!/usr/bin/env node
/**
 * Runs before `server.js`, in both `npm start` and the container image.
 *
 * `instrumentation.register()` validates the environment too, but only once the
 * server is already booting: in a container that means a crash loop or, on a
 * serverless target, a 500 on the first request of every cold start. This runs
 * first, in the same environment the server will get — the `--env-file-if-exists`
 * flags on the command line are the same ones `npm start` passes to `server.js`,
 * so a local `.env.local` counts here exactly as it does there.
 *
 * The validator is imported from `production.ts`, not `config/env`: that module
 * builds `clientEnv` at load time and throws outside a build when a
 * `NEXT_PUBLIC_*` variable is missing. Those values are inlined at build, so a
 * container legitimately does not have them, and importing them here would
 * refuse to start a correctly configured image.
 */
import { validateProductionRequiredEnv } from "../src/config/env/production.ts";

// The standalone server forces this for itself; this process runs before it, so
// the artifact is a production release here too. `production.ts` reads NODE_ENV
// at call time, which is why setting it after the import still applies.
process.env.NODE_ENV = "production";

try {
  validateProductionRequiredEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "[ShipIN] Refusing to start. Fix the environment above, or the server will " +
      "fail on every request instead of here."
  );
  process.exit(1);
}
