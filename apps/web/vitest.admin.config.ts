import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Firebase Admin SDK contract suite.
 *
 * Separate from `vitest.config.ts` because it needs the Firestore and Auth
 * emulators (Java) and the `firebase emulators:exec` wrapper. `npm run test:admin`
 * starts them, runs this suite and stops them.
 *
 * It does not load `vitest.setup.ts`, which mocks `@/config/env` — that mock
 * hides the emulator branch in `src/lib/firebaseAdmin.ts` and the suite would
 * be testing its own fixture again.
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
    environment: "node",
    include: ["tests/admin-contract/**/*.test.ts"],
    setupFiles: ["./tests/admin-contract/setup.ts"],
    // One emulator holds all state: a parallel file would see another file's
    // documents, and this suite asserts on what it just wrote.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
