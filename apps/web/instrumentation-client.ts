/**
 * Browser-side instrumentation entry point (Next 15.3+/16).
 *
 * Without this file the client SDK is never initialised: `sentry.client.config.ts`
 * existed but nothing imported it, so no browser error, rejection or CSP-related
 * client failure was ever reported.
 *
 * The `import()` is deliberate, not stylistic. This file is part of every
 * route's entry, so a static import of the SDK added ~75 KB gzipped to the
 * initial JavaScript of all 30 routes — the per-route budget check caught it.
 * A dynamic import makes it a separate chunk that the browser fetches after
 * hydration, and the guard means a build without a DSN never requests it at
 * all.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && process.env.NODE_ENV === 'production') {
  void import('./sentry.client.config');
}
