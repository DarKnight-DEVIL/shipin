/**
 * Unit tests for MFA (TOTP, backup codes, SMS) utilities.
 */

import { describe, it, expect } from 'vitest';
import { generateSync } from 'otplib';

import {
  generateTotpSecret,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  getTotpQrUrl,
  renderTotpQrDataUrl,
  generateSmsCode,
  hashSmsCode,
  SMS_CODE_TTL_MS,
} from './mfa';

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('TOTP secrets', () => {
  it('generates an unpadded base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it('generates a different secret each time', () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe('verifyTotp', () => {
  it('accepts the current code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, generateSync({ secret }))).toBe(true);
  });

  it('trims whitespace around the code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, `  ${generateSync({ secret })}  `)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    const current = generateSync({ secret });
    const wrong = current === '000000' ? '111111' : '000000';
    expect(verifyTotp(secret, wrong)).toBe(false);
  });

  it('rejects malformed codes without throwing', () => {
    const secret = generateTotpSecret();
    for (const code of ['', '12345', '1234567', 'abcdef', '12345a']) {
      expect(verifyTotp(secret, code)).toBe(false);
    }
  });

  it('rejects verification against a malformed secret without throwing', () => {
    expect(verifyTotp('not-base32!!!', '123456')).toBe(false);
  });

  it('accepts the previous time step by default', () => {
    const secret = generateTotpSecret();
    const previous = generateSync({ secret, epoch: nowSeconds() - 30 });
    expect(verifyTotp(secret, previous)).toBe(true);
  });

  it('rejects the previous time step when the window is 0', () => {
    const secret = generateTotpSecret();
    const previous = generateSync({ secret, epoch: nowSeconds() - 30 });
    expect(verifyTotp(secret, previous, 0)).toBe(false);
  });

  it('rejects a code two time steps old even with the default window', () => {
    const secret = generateTotpSecret();
    const stale = generateSync({ secret, epoch: nowSeconds() - 90 });
    expect(verifyTotp(secret, stale)).toBe(false);
  });
});

describe('backup codes', () => {
  it('generates the requested number of codes', () => {
    expect(generateBackupCodes(5)).toHaveLength(5);
    expect(generateBackupCodes(1)).toHaveLength(1);
  });

  it('generates 10 codes by default', () => {
    expect(generateBackupCodes()).toHaveLength(10);
  });

  it('formats codes as XXXX-XXXX uppercase hex', () => {
    for (const code of generateBackupCodes(5)) {
      expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    }
  });

  it('does not repeat codes', () => {
    const codes = generateBackupCodes(20);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('hashes codes with SHA-256', () => {
    expect(hashBackupCode('ABCD-EF12')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashes case-insensitively and ignores surrounding whitespace', () => {
    expect(hashBackupCode(' abcd-ef12 ')).toBe(hashBackupCode('ABCD-EF12'));
  });

  it('returns the index of a matching code', () => {
    const codes = generateBackupCodes(3);
    const hashed = codes.map(hashBackupCode);
    codes.forEach((code, index) => {
      expect(verifyBackupCode(code, hashed)).toBe(index);
    });
  });

  it('returns -1 for a code that does not match', () => {
    const hashed = generateBackupCodes(3).map(hashBackupCode);
    expect(verifyBackupCode('INVALID-CODE', hashed)).toBe(-1);
  });

  it('returns -1 when no hashes are stored', () => {
    expect(verifyBackupCode('ABCD-EF12', [])).toBe(-1);
  });
});

describe('getTotpQrUrl', () => {
  it('builds an otpauth URI with secret, issuer and label', () => {
    const url = getTotpQrUrl('JBSWY3DPEHPK3PXP', 'TestApp', 'user@example.com');

    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('issuer=TestApp');
    expect(decodeURIComponent(url)).toContain('TestApp:user@example.com');
  });

  it('defaults the issuer to the ShipIN Admin label', () => {
    const url = getTotpQrUrl('JBSWY3DPEHPK3PXP', undefined, 'user@example.com');

    expect(decodeURIComponent(url)).toContain('ShipIN Admin:user@example.com');
  });
});

describe('renderTotpQrDataUrl', () => {
  it('renders a PNG data URL', async () => {
    const url = getTotpQrUrl('JBSWY3DPEHPK3PXP', 'Test', 'user@test.com');
    const dataUrl = await renderTotpQrDataUrl(url);

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(100);
  });
});

describe('SMS codes', () => {
  it('generates a 6-digit code', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSmsCode()).toMatch(/^\d{6}$/);
    }
  });

  it('does not always generate the same code', () => {
    const codes = new Set(Array.from({ length: 20 }, generateSmsCode));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('hashes codes with SHA-256', () => {
    const hash = hashSmsCode('123456');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashSmsCode('123456'));
    expect(hash).not.toBe(hashSmsCode('654321'));
  });

  it('exposes a 5 minute TTL', () => {
    expect(SMS_CODE_TTL_MS).toBe(5 * 60 * 1000);
  });
});
