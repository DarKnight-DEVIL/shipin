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
  // The capture claim, PayPal capture/create calls and both settlement steps.
  "src/lib/paypal/**": PAYMENT_COVERAGE,
  "src/features/wallet/**": PAYMENT_COVERAGE,
  "src/features/finance/**": PAYMENT_COVERAGE,
  "src/features/payment/**": PAYMENT_COVERAGE,
  // Admin wallet hook: credit top-ups and refund requests live here, but it
  // sits under features/admin, so no wallet glob reached it. Listed explicitly
  // rather than widening `features/admin/**`, which is mostly not money code.
  "src/features/admin/hooks/useAdminWallet.ts": PAYMENT_COVERAGE,

  // ---- DPDP/GDPR compliance: consent, retention, data-subject rights ----
  "src/lib/compliance/**": COMPLIANCE_COVERAGE,
  "src/app/api/compliance/**": COMPLIANCE_COVERAGE,
};
