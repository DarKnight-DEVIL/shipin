import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

import { COVERAGE_GLOB_THRESHOLDS } from "./coverage-thresholds.mjs";

// Dedicated coverage run for the component layer (docs/AUDIT.md §2.10).
//
// The component `.tsx` files cannot join the main `vitest.config.ts` coverage
// run: Vitest counts every covered file into the global thresholds, and 121
// mostly-untested presentational components drag the aggregate from ~95% to
// ~72% — failing a floor the rest of the code already meets. So the
// components get their own run with their own aggregate floor
// (`COMPONENTS_COVERAGE` in `coverage-thresholds.mjs`): no `perFile`, so an
// untested presentational file does not fail the gate, but deleting the
// component tests that exist does. The floor is a ramp — raise it as
// components gain tests.
//
// `npm run test:coverage:components` runs this config; CI runs it next to the
// main coverage gate.

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws when imported outside a React Server Component
      // bundle; tests exercise those modules directly, so stub it out.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
    conditions: ["test"],
  },
  test: {
    globals: true,
    // Components opt into happy-dom with a per-file pragma, exactly like the
    // main config.
    environment: "node",
    isolate: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/components/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Enabled here, not via a --coverage flag: this config exists to be a
      // coverage gate, so a bare `vitest run --config …` must measure it.
      enabled: true,
      reporter: ["text", "json-summary"],
      include: ["src/components/**/*.tsx"],
      exclude: [
        "src/components/**/*.test.tsx", // test files are not production code
        "src/components/ui/index.ts", // re-export barrel: no executable statements
        "src/components/settings/settingsStyles.ts", // static class names, no logic
      ],
      thresholds: {
        // Shared with the checker script and the main config via
        // coverage-thresholds.mjs, so there is one definition of the floor.
        // (The main run skips this glob: it covers no component .tsx files;
        // this run skips the other globs for the same reason in reverse.)
        "src/components/**/*.tsx":
          COVERAGE_GLOB_THRESHOLDS["src/components/**/*.tsx"],
      },
    },
  },
});
