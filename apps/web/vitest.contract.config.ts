import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Live contract suites — network, credentials, no mocks.
 *
 * Kept out of the default config on purpose: `vitest.config.ts` includes
 * `src/**` and `scripts/**`, and this suite talks to a real PayPal sandbox. It
 * also does not load `vitest.setup.ts`, which mocks `@/config/env`; see
 * `tests/contract/setup.ts`.
 *
 * Run it with `npm run test:contract`. Nothing here can move money: the
 * capture and refund cases only assert the error paths of an unapproved order
 * and an unknown capture.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
    conditions: ["test"],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/contract/**/*.test.ts"],
    setupFiles: ["./tests/contract/setup.ts"],
    // PayPal sandbox can be slow under load; the default 5s is a flake source,
    // not a signal.
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // One file at a time: these calls share a sandbox application, and an
    // OAuth plus order-creation burst is exactly what the rate limiter exists
    // to stop.
    fileParallelism: false,
  },
});
