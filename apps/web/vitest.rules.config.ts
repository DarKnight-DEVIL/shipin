import { defineConfig } from 'vitest/config';

/**
 * Firestore security-rules suite.
 *
 * Deliberately separate from `vitest.config.ts`: these tests need the Firestore
 * emulator (Java) and the `firebase emulators:exec` wrapper, so they must not
 * run as part of `npm test`. Run them with:
 *
 *   npm run test:rules
 *
 * They exercise the real `firestore.rules` file through the emulator. The
 * generic suite's `src/lib/firestoreRules.test.ts` re-implements the rules in
 * JavaScript, so it cannot catch a regression in the rules themselves.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // One emulator instance holds all state: run files serially, never in
    // parallel, or one file's `clearFirestore()` wipes another's fixtures.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
