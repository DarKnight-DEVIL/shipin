/**
 * Vitest unit tests for support message validation logic.
 */
import { describe, it, expect } from 'vitest';

describe('support message sender validation', () => {
  function validateSender(sender: unknown): string {
    return sender === 'admin' ? 'admin' : sender === 'customer' ? 'customer' : '';
  }

  it('accepts admin and customer as valid senders', () => {
    expect(validateSender('admin')).toBe('admin');
    expect(validateSender('customer')).toBe('customer');
  });

  it('rejects any other sender value', () => {
    expect(validateSender('support')).toBe('');
    expect(validateSender(null)).toBe('');
    expect(validateSender(undefined)).toBe('');
    expect(validateSender(42)).toBe('');
  });
});

describe('message trimming', () => {
  function truncateMessage(msg: unknown): string {
    return typeof msg === 'string' ? msg.trim() : '';
  }

  it('trims whitespace from messages', () => {
    expect(truncateMessage('   hello   ')).toBe('hello');
    expect(truncateMessage('valid message')).toBe('valid message');
  });

  it('converts non-string input to empty string', () => {
    expect(truncateMessage(123)).toBe('');
    expect(truncateMessage(null)).toBe('');
    expect(truncateMessage(undefined)).toBe('');
  });
});


describe('phone number masking', () => {
  function maskPhoneNumber(phoneNumber: unknown): string | null {
    if (typeof phoneNumber !== 'string') return null;
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 4) return null;
    return `••• ••• ${digits.slice(-4)}`;
  }

  it('masks all but last 4 digits', () => {
    expect(maskPhoneNumber('+1 (555) 123-4567')).toBe('••• ••• 4567');
  });

  it('strips non-digit characters before masking', () => {
    expect(maskPhoneNumber('abc1234def5678xyz')).toBe('••• ••• 5678');
  });

  it('returns null for short numbers', () => {
    expect(maskPhoneNumber('123')).toBeNull();
    expect(maskPhoneNumber('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(maskPhoneNumber(null)).toBeNull();
    expect(maskPhoneNumber(1234567890)).toBeNull();
    expect(maskPhoneNumber(undefined)).toBeNull();
  });
});
