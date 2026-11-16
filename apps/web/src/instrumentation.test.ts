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

  it('exits the process instead of continuing to boot', () => {
    // Mock the exit so the assertion does not take the test worker down with it.
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);

    hooks.validate.mockImplementation(() => {
      throw new Error('Missing required env: PAYPAL_WEBHOOK_ID');
    });

    // A throw alone leaves Next serving 500s; the process has to die so the
    // platform fails the deployment.
    expect(() => register()).toThrow('process.exit(1)');
    expect(exit).toHaveBeenCalledWith(1);
    expect(hooks.reportRateLimit).not.toHaveBeenCalled();
    expect(hooks.reportAppCheck).not.toHaveBeenCalled();

    exit.mockRestore();
  });

  it('rethrows instead of exiting on the edge runtime, which has no process.exit', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const previousRuntime = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = 'edge';

    hooks.validate.mockImplementation(() => {
      throw new Error('Missing required env: PAYPAL_WEBHOOK_ID');
    });

    try {
      expect(() => register()).toThrow('PAYPAL_WEBHOOK_ID');
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
      if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = previousRuntime;
    }
  });
});
