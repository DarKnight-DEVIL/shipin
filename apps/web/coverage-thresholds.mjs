/**
 * Floors that apply to every file, before the family floors below.
 *
 * Exported so there is one definition of "global minimum": vitest.config.ts
 * spreads it into `coverage.thresholds`, and `check-coverage-globs.mjs` uses it
 * to reject a family floor that is *weaker* than the global one (which would
 * read like a stricter gate while enforcing nothing extra).
 */
export const GLOBAL_COVERAGE_FLOORS = {
  lines: 80,
  functions: 80,
  branches: 70,
  statements: 80,
};

/** Coverage floors that apply to all packages (*.ui, *.utils, *.config, *.shared).
 * Shares the same metric keys as the global minimum so the checker script
 * can validate them without duplication.
 */

export const PACKAGES_GLOBAL_FLOORS = {
  lines: 80,
  functions: 80,
  branches: 70,
  statements: 80,
};

/** The only metric keys a threshold object may contain. */
export const COVERAGE_METRICS = Object.keys(GLOBAL_COVERAGE_FLOORS);

/**
 * Coverage thresholds for the two families that carry real financial and legal
 * risk.
 *
 * These live in a plain module rather than inline in `vitest.config.ts` because
 * two consumers need them: the Vitest config, and
 * `scripts/check-coverage-globs.mjs`, which fails CI when a threshold glob
 * matches no file. Vitest silently ignores a threshold whose glob resolves to
 * nothing, so a typo would disable a gate without turning anything red — the
 * checker closes that hole by importing the exact same keys the config uses.
 *
 * Each floor sits a point or two under its measured value: the gate should
 * catch erosion, not fail on the next honestly-tested helper.
 *
 * Values are validated by `scripts/check-coverage-globs.mjs`: every family
 * floor must be a real percentage between the global minimum and 100, and every
 * key must be a metric Vitest understands. A typo like `brnaches: 90` would
 * otherwise be ignored by Vitest and leave the gate silently absent.
 */

export const PAYMENT_COVERAGE = {
  // Measured worst case across the payment subtrees: 89.47% lines, 90.00%
  // statements, 100% functions, 90.60% branches (`src/app/api/admin/wallet/**`).
  // The refund routes and `src/lib/paypal.ts` are both at 100% branches now, so
  // the weakest glob is the admin wallet routes and that is what caps the floor:
  // 90 sits 0.60 points under it, which is the tightest this family allows
  // today. One lost branch there fails the gate, which is the erosion it exists
  // to catch. Raise these only by raising the weakest glob first.
  lines: 88.5,
  statements: 89,
  functions: 99,
  branches: 90,
};

export const COMPLIANCE_COVERAGE = {
  // Measured worst case: 97.93% lines (`lib/compliance/**`), 97.00%
  // statements and 96.00% branches (`api/compliance/**`), 100% functions.
  lines: 96.5,
  statements: 96,
  functions: 99,
  branches: 88.5,
};

/**
 * Coverage floors for the component layer - the .tsx files under
 * src/components, measured by the dedicated components run
 * (vitest.components.config.ts, npm run test:coverage:components).
 *
 * These files cannot join the main coverage run: folded into the global
 * aggregate they drag it from ~95% to 71.9% statements, which would fail
 * the global floor the rest of the code already meets. They get their own
 * run instead, with their own aggregate floor - no perFile, so an
 * untested presentational file does not fail the gate, but deleting the
 * component tests that exist does.
 *
 * Measured 2026-11-24 over 121 component .tsx files against the 12
 * component test files: 15.95% statements, 9.69% branches, 12.93%
 * functions. Each floor sits under its measured value; raise them as
 * components gain tests.
 */
export const COMPONENTS_COVERAGE = {
  lines: 14,
  statements: 14,
  functions: 11,
  branches: 8.5,
};
/**
 * Threshold globs, one entry per subtree.
 *
 * Every key here is treated as a glob by Vitest and by the checker script, so
 * every key must match at least one file. Each glob is checked on its own
 * aggregate, so a strong sibling cannot carry a weak subtree.
 */
export const COVERAGE_GLOB_THRESHOLDS = {
  // ---- Payment-critical: money movement, refunds, wallet balances ----
  "src/app/api/paypal/**": PAYMENT_COVERAGE,
  "src/app/api/payment/**": PAYMENT_COVERAGE,
  "src/app/api/admin/wallet/**": PAYMENT_COVERAGE,
  "src/app/api/admin/requests/*/*refund*/**": PAYMENT_COVERAGE,
  "src/lib/paypal.ts": PAYMENT_COVERAGE,
  // The one module that converts between decimals and minor units, and the only
  // place money arithmetic is allowed to round (ADR-0008). Measured 99% lines,
  // 97.1% statements, 100% functions, 98.9% branches; the missing branch is the
  // unreachable-in-practice `unsupported currency` guard.
  "src/lib/money.ts": PAYMENT_COVERAGE,
  // The capture claim, PayPal capture/create calls and both settlement steps.
  "src/lib/paypal/**": PAYMENT_COVERAGE,
  "src/features/wallet/**": PAYMENT_COVERAGE,
  "src/features/finance/**": PAYMENT_COVERAGE,
  "src/features/payment/**": PAYMENT_COVERAGE,
  // Admin wallet hook: credit top-ups and refund requests live here, but it
  // sits under features/admin, so no wallet glob reached it. Listed explicitly
  // rather than widening `features/admin/**`, which is mostly not money code.
  "src/features/admin/hooks/useAdminWallet.ts": PAYMENT_COVERAGE,
    // The payment reconciler keeps Firestore in step with what PayPal actually
  // reports. It sits under api/admin/payments, which no wallet or paypal glob
  // above reaches, so it is listed explicitly. Its sibling, the delivery-health
  // probe `src/lib/paypalWebhookHealth.ts`, was deleted in the §2.6 orphan
  // cleanup, and this entry went with it: a glob that matches no file makes
  // Vitest skip the gate silently, which `check:coverage-globs` rejects.
  "src/app/api/admin/payments/**": PAYMENT_COVERAGE,

  // ---- DPDP/GDPR compliance: consent, retention, data-subject rights ----
  "src/lib/compliance/**": COMPLIANCE_COVERAGE,
  "src/app/api/compliance/**": COMPLIANCE_COVERAGE,
  // The scheduled retention purge deletes customer evidence, so it is held to
  // the compliance floor rather than the global one: it is the one admin route
  // whose bugs destroy photos and support transcripts.
  "src/app/api/admin/compliance/**": COMPLIANCE_COVERAGE,
  // ---- Package-level coverage floors ----
  "packages/config/src/**": PACKAGES_GLOBAL_FLOORS,

  // ---- Component layer ----
  // Own run, own config: the main coverage run does not cover
  // component .tsx files, so Vitest skips this glob there; the
  // components run imports the same map and enforces it. The checker
  // still validates that the glob matches files on disk.
  "src/components/**/*.tsx": COMPONENTS_COVERAGE,
};
