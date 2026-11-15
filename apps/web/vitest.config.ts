import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Payment and compliance floors, plus the globs they apply to. They live in
// their own module so `scripts/check-coverage-globs.mjs` can assert that every
// glob still resolves to a file: Vitest skips a glob-keyed threshold silently
// when nothing matches it.
import {
  COVERAGE_GLOB_THRESHOLDS,
  GLOBAL_COVERAGE_FLOORS,
} from './coverage-thresholds.mjs';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` throws when imported outside a React Server Component
      // bundle; tests exercise those modules directly, so stub it out.
      'server-only': path.resolve(__dirname, './vitest.server-only-stub.ts'),
    },
    conditions: ['test'],
  },
  test: {
    globals: true,
    // Default to the Node environment: most suites are pure logic and API
    // handlers. Creating a happy-dom window per file was costing ~142 windows
    // per run. Files that need a DOM opt in with `// @vitest-environment happy-dom`.
    environment: 'node',
    // A worker reuses its module registry across files instead of rebuilding one
    // per file. That is only safe because no suite relies on module identity any
    // more: files that mock a shared module re-import their subject per file
    // (vi.resetModules), and React Testing Library cleanup is registered per
    // file in vitest.setup.ts. `npx vitest run --no-isolate --maxWorkers=1` and
    // `--sequence.shuffle` are the leak detectors if this ever regresses.
    isolate: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // ---------------------------------------------------------------------------
    // Coverage thresholds.
    //
    // ShipIN handles real money, so coverage is a safety gate — not a metric.
    // Payment-critical paths (wallet, PayPal, refunds) and the compliance
    // modules have a higher bar, enforced per glob below. Global `perFile`
    // above still applies to every file, so the two gates combine: no single
    // file may fall under 80/80/70/80, and no payment or compliance subtree may
    // fall under its family floor.
    // ---------------------------------------------------------------------------
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/lib/**', 'src/features/**/*.ts', 'src/app/api/**/*.ts'],
      exclude: [
        'src/app/api/**/route.test.ts', // test files are not production code
        'src/types/**',
        'src/styles/**',
        'src/components/**', // UI components are covered by E2E
        'src/lib/firebase.ts', // lazy singleton with no unit-level exercise path
        'src/features/**/types/README.md', // feature docs, not runtime code
        '**/README.md',
      ],
      thresholds: {
        // Global floor — every module must be exercised. Shared with the
        // checker script so "the global minimum" has one definition.
        ...GLOBAL_COVERAGE_FLOORS,
        perFile: true,

        // ---- Payment-critical and DPDP/GDPR compliance subtrees ----
        // Each glob is checked on its own aggregate, so a strong sibling cannot
        // carry a weak subtree. Every glob must match a file, or its gate is
        // dead weight — `npm run check:coverage-globs` enforces that in CI.
        ...COVERAGE_GLOB_THRESHOLDS,
      },
    },
  },
});