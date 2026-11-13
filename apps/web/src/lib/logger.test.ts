/**
 * Unit tests for the structured logger.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, childLogger } from './logger';

describe('logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  describe('error', () => {
    it('logs error message with context', () => {
      logger.error('Payment failed', { requestId: 'req-123', amount: 100 });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Payment failed')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('requestId')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('amount')
      );
    });

    it('includes timestamp in ISO format', () => {
      logger.error('Test');
      const call = consoleErrorSpy.mock.calls[0][0];
      const timestampMatch = call.match(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
      expect(timestampMatch).not.toBeNull();
    });

    it('handles unserializable context gracefully', () => {
      const circular: { a: number; self?: unknown } = { a: 1 };
      circular.self = circular;
      logger.error('Test', { circular });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[unserializable context]')
      );
    });
  });

  describe('warn', () => {
    it('logs warning message', () => {
      logger.warn('Rate limit approaching', { ip: '1.2.3.4', remaining: 2 });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] Rate limit approaching')
      );
    });
  });

  describe('info', () => {
    it('logs info message via warn (info level uses warn)', () => {
      logger.info('User logged in', { userId: 'user-123' });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] User logged in')
      );
    });
  });

  describe('debug', () => {
    it('logs debug message in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      logger.debug('Debug info', { detail: 'value' });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Debug info')
      );
    });

    it('suppresses debug in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      logger.debug('Debug info', { detail: 'value' });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('childLogger', () => {
    it('includes base context in all logs', () => {
      const child = childLogger({ service: 'paypal', requestId: 'req-123' });
      child.error('Payment failed', { amount: 50 });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('service')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('requestId')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('amount')
      );
    });

    it('merges child context with call context', () => {
      const child = childLogger({ base: 'value' });
      child.info('Test', { override: 'call' });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('base')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('override')
      );
    });

    it('child overrides base context when keys collide', () => {
      const child = childLogger({ key: 'base' });
      child.warn('Test', { key: 'call' });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"key":"call"')
      );
    });
  });
});