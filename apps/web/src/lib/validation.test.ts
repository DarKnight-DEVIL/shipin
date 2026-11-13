import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  whatsappPhoneSchema,
  moneySchema,
  idSchema,
  uuidSchema,
  messageSchema,
  nameSchema,
  paymentTypeSchema,
  refundMethodSchema,
  requestStatusSchema,
  sendEmailBodySchema,
  captureOrderBodySchema,
  createOrderBodySchema,
  r2ViewBodySchema,
  validateBody,
} from '@/lib/validation';

describe('emailSchema', () => {
  it('accepts valid emails', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
    expect(emailSchema.safeParse('first.last+tag@sub.example.co').success).toBe(true);
    expect(emailSchema.safeParse('  spaced@ex.com  ').success).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
    expect(emailSchema.safeParse('no-at-sign.com').success).toBe(false);
    expect(emailSchema.safeParse('user@').success).toBe(false);
    expect(emailSchema.safeParse('@example.com').success).toBe(false);
    expect(emailSchema.safeParse('user@.com').success).toBe(false);
    expect(emailSchema.safeParse('a'.repeat(256) + '@example.com').success).toBe(false);
    expect(emailSchema.safeParse('user@@example.com').success).toBe(false);
  });
});

describe('whatsappPhoneSchema', () => {
  it('strips non-digits and accepts valid phone numbers', () => {
    const parsed = whatsappPhoneSchema.safeParse('+1 (555) 123-4567');
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe('15551234567');
  });

  it('rejects too short / too long numbers', () => {
    expect(whatsappPhoneSchema.safeParse('12345').success).toBe(false);
    expect(whatsappPhoneSchema.safeParse('1'.repeat(16)).success).toBe(false);
    expect(whatsappPhoneSchema.safeParse('').success).toBe(false);
  });
});

describe('moneySchema', () => {
  it('accepts positive finite amounts with max 2 decimals', () => {
    expect(moneySchema.safeParse(10).success).toBe(true);
    expect(moneySchema.safeParse(0.01).success).toBe(true);
    expect(moneySchema.safeParse(999999999).success).toBe(true);
  });

  it('rejects invalid amounts', () => {
    expect(moneySchema.safeParse(0).success).toBe(false);
    expect(moneySchema.safeParse(-5).success).toBe(false);
    expect(moneySchema.safeParse(NaN).success).toBe(false);
    expect(moneySchema.safeParse(Infinity).success).toBe(false);
    expect(moneySchema.safeParse(10.123).success).toBe(false);
    expect(moneySchema.safeParse(1000000000).success).toBe(false);
  });
});

describe('idSchema', () => {
  it('accepts safe document IDs', () => {
    expect(idSchema.safeParse('abc-123_XYZ').success).toBe(true);
  });

  it('rejects dangerous or oversized IDs (prevents path/selector injection)', () => {
    expect(idSchema.safeParse('a/b').success).toBe(false);
    expect(idSchema.safeParse('a..b').success).toBe(false);
    expect(idSchema.safeParse('').success).toBe(false);
    expect(idSchema.safeParse('x'.repeat(65)).success).toBe(false);
    expect(idSchema.safeParse('id; delete from users').success).toBe(false);
  });
});

describe('uuidSchema', () => {
  it('accepts a strict UUID', () => {
    expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('rejects malformed UUIDs', () => {
    expect(uuidSchema.safeParse('550e8400e29b41d4a716446655440000').success).toBe(false);
    expect(uuidSchema.safeParse('zzze8400-e29b-41d4-a716-446655440000').success).toBe(false);
    expect(uuidSchema.safeParse('').success).toBe(false);
  });
});

describe('messageSchema', () => {
  it('trims and bounds length', () => {
    expect(messageSchema.safeParse('   hello   ').success).toBe(true);
    expect(messageSchema.safeParse('x'.repeat(2001)).success).toBe(false);
    expect(messageSchema.safeParse('   ').success).toBe(false);
  });
});

describe('nameSchema', () => {
  it('accepts Latin names with spaces, apostrophes, hyphens', () => {
    expect(nameSchema.safeParse("John O'Dea-Smythe").success).toBe(true);
  });

  it('rejects script injection in names', () => {
    expect(nameSchema.safeParse('<script>alert(1)</script>').success).toBe(false);
    expect(nameSchema.safeParse('name; DROP TABLE users').success).toBe(false);
  });
});

describe('enum schemas', () => {
  it('paymentTypeSchema is a closed set', () => {
    expect(paymentTypeSchema.safeParse('main').success).toBe(true);
    expect(paymentTypeSchema.safeParse('additional_item').success).toBe(true);
    expect(paymentTypeSchema.safeParse('admin').success).toBe(false);
  });

  it('refundMethodSchema is a closed set', () => {
    expect(refundMethodSchema.safeParse('wallet').success).toBe(true);
    expect(refundMethodSchema.safeParse('paypal').success).toBe(true);
    expect(refundMethodSchema.safeParse('bitcoin').success).toBe(false);
  });

  it('requestStatusSchema is a closed set', () => {
    expect(requestStatusSchema.safeParse('submitted').success).toBe(true);
    expect(requestStatusSchema.safeParse('magic').success).toBe(false);
  });
});

describe('body schemas', () => {
  it('sendEmailBodySchema requires a valid email', () => {
    const ok = sendEmailBodySchema.safeParse({ email: 'a@b.co', type: 'quote' });
    expect(ok.success).toBe(true);
    const bad = sendEmailBodySchema.safeParse({ email: 'nope' });
    expect(bad.success).toBe(false);
  });

  it('captureOrderBodySchema validates all payment fields', () => {
    const ok = captureOrderBodySchema.safeParse({
      requestId: 'req_1',
      orderID: 'ORDER123',
      amount: 42.5,
    });
    expect(ok.success).toBe(true);

    const missingOrderId = captureOrderBodySchema.safeParse({
      requestId: 'req_1',
      amount: 42.5,
    });
    expect(missingOrderId.success).toBe(false);

    const badAmount = captureOrderBodySchema.safeParse({
      requestId: 'req_1',
      orderID: 'ORDER123',
      amount: -1,
    });
    expect(badAmount.success).toBe(false);
  });

  it('createOrderBodySchema applies default paymentType', () => {
    const parsed = createOrderBodySchema.safeParse({ requestId: 'req_1', amount: 10 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.paymentType).toBe('main');
  });

  it('r2ViewBodySchema only allows inspection/ keys (no traversal)', () => {
    expect(r2ViewBodySchema.safeParse({ key: 'inspection/req-1/photo.jpg' }).success).toBe(true);
    expect(r2ViewBodySchema.safeParse({ key: 'warehouse/secret.pdf' }).success).toBe(false);
    expect(r2ViewBodySchema.safeParse({ key: '../../etc/passwd' }).success).toBe(false);
    expect(r2ViewBodySchema.safeParse({ key: '' }).success).toBe(false);
  });
});

describe('validateBody', () => {
  it('returns success with typed data', () => {
    const result = validateBody({ requestId: 'abc', amount: 5 }, createOrderBodySchema);
    expect(result.success).toBe(true);
  });

  it('returns structured errors on failure', () => {
    const result = validateBody({ amount: 'not-a-number' }, createOrderBodySchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('message');
    }
  });

  it('rejects non-object input', () => {
    const result = validateBody(null, createOrderBodySchema);
    expect(result.success).toBe(false);
    const result2 = validateBody('string', createOrderBodySchema);
    expect(result2.success).toBe(false);
  });
});

