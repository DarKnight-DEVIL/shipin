import { describe, it, expect } from 'vitest';

import { redactPii } from './auth';

describe('redactPii', () => {
  it('removes email addresses', () => {
    expect(redactPii('no user record for jane.doe+ops@example.co.uk')).toBe(
      'no user record for [email]'
    );
  });

  it('removes phone numbers', () => {
    expect(redactPii('phone +91 98765 43210 is not verified')).toBe(
      'phone [phone] is not verified'
    );
    expect(redactPii('call 555-010-9999')).toBe('call [phone]');
  });

  it('collapses line breaks so one event stays on one log line', () => {
    expect(redactPii('first line\nsecond\r\nthird')).toBe('first line second third');
  });

  it('leaves harmless diagnostics untouched', () => {
    expect(redactPii('auth/id-token-expired')).toBe('auth/id-token-expired');
    expect(redactPii('INVALID_ARGUMENT: token malformed')).toBe(
      'INVALID_ARGUMENT: token malformed'
    );
  });

  it('redacts several values in one message', () => {
    expect(redactPii('user a@b.co with phone +15551234567 failed')).toBe(
      'user [email] with phone [phone] failed'
    );
  });
});
