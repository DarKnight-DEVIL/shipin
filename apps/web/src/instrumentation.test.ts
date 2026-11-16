/**
 * `instrumentation.ts` — the startup hook.
 *
 * Its whole job is wiring: run the required-env validation, then report the two
 * degraded configurations (no shared rate-limit store, App Check enforced with
 * no site key). Both reporters are warning-only by design — a configuration
 * problem must show up in `/api/health`, not take the deployment's sign-in page
 * down with it — so the property worth testing is that `register` calls them and
 * does not swallow a hard validation failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const hooks = vi.hoisted(() => ({
  validate: vi.fn(),
  reportRateLimit: vi.fn(),
  reportAppCheck: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  validateProductionRequiredEnv: hooks.validate,
}));

vi.mock('@/lib/redisRateLimiter', () => ({
  reportRateLimitStoreStatus: hooks.reportRateLimit,
  createSharedRateLimiter: vi.fn(() => ({
    record: vi.fn().mockResolvedValue({ ok: true, limit: 100, remaining: 100, reset: Date.now() + 60000 }),
    getErrorCounts: vi.fn(() => []),
  })),
}));

vi.mock('@/lib/appCheck', () => ({
  reportAppCheckStatus: hooks.reportAppCheck,
}));

import { register } from './instrumentation';

beforeEach(() => {
  hooks.validate.mockReset();
  hooks.reportRateLimit.mockReset();
  hooks.reportAppCheck.mockReset();
});

describe('register', () => {
  it('validates env, then reports both degraded configurations', () => {
    register();

    expect(hooks.validate).toHaveBeenCalledTimes(1);
    expect(hooks.reportRateLimit).toHaveBeenCalledTimes(1);
    expect(hooks.reportAppCheck).toHaveBeenCalledTimes(1);

    // Order matters: a missing required variable is a boot failure, so it must
    // raise before the warning-only reporters run.
    expect(hooks.validate.mock.invocationCallOrder[0]).toBeLessThan(
      hooks.reportRateLimit.mock.invocationCallOrder[0]
    );
    expect(hooks.reportRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      hooks.reportAppCheck.mock.invocationCallOrder[0]
    );
  });

  it('propagates a missing required variable instead of continuing to boot', () => {
    hooks.validate.mockImplementation(() => {
      throw new Error('Missing required env: PAYPAL_WEBHOOK_ID');
    });

    expect(() => register()).toThrow('PAYPAL_WEBHOOK_ID');
    expect(hooks.reportRateLimit).not.toHaveBeenCalled();
    expect(hooks.reportAppCheck).not.toHaveBeenCalled();
  });
});
