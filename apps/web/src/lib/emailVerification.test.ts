/**
 * `lib/emailVerification.ts`.
 *
 * Both behaviours here are failure modes that trap a real user on the verify
 * screen: an invalid continue URL makes `sendEmailVerification` send nothing,
 * and a stale ID token makes the first dashboard request 403.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  RESEND_COOLDOWN_MS,
  isRateLimitedResend,
  refreshVerifiedToken,
  resendVerificationErrorMessage,
  verificationContinueUrl,
  verificationEmailOptions,
} from './emailVerification';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isRateLimitedResend', () => {
  it('recognises the rate-limit code', () => {
    expect(isRateLimitedResend({ code: 'auth/too-many-requests' })).toBe(true);
  });

  it('does not treat other failures as rate limits', () => {
    // Only this one code earns a button cooldown: a network blip should be
    // retryable immediately.
    expect(isRateLimitedResend({ code: 'auth/network-request-failed' })).toBe(false);
    expect(isRateLimitedResend(new Error('offline'))).toBe(false);
    expect(isRateLimitedResend(null)).toBe(false);
    expect(isRateLimitedResend(undefined)).toBe(false);
  });

  it('cools down for the minute the message promises', () => {
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
  });
});

describe('verificationContinueUrl', () => {
  it('builds the verify path from an absolute URL', () => {
    expect(verificationContinueUrl('https://shipin-psi.vercel.app')).toBe(
      'https://shipin-psi.vercel.app/verify-email'
    );
  });

  it('normalises trailing slashes', () => {
    expect(verificationContinueUrl('https://shipin.example.com///')).toBe(
      'https://shipin.example.com/verify-email'
    );
  });

  it('accepts a loopback development URL', () => {
    expect(verificationContinueUrl('http://localhost:3000')).toBe(
      'http://localhost:3000/verify-email'
    );
  });

  it('rejects a missing base URL', () => {
    // An explicit `undefined` means "read clientEnv", so an unset value is
    // represented by the empty string here.
    expect(verificationContinueUrl('')).toBeUndefined();
  });

  it('rejects a relative base URL that Firebase would refuse', () => {
    // `sendEmailVerification({ url: "/verify-email" })` throws
    // auth/invalid-continue-uri and sends no email at all.
    expect(verificationContinueUrl('/verify-email')).toBeUndefined();
    expect(verificationContinueUrl('verify-email')).toBeUndefined();
    expect(verificationContinueUrl('localhost:3000')).toBeUndefined();
  });

  it('rejects non-http schemes', () => {
    expect(verificationContinueUrl('ftp://shipin.example.com')).toBeUndefined();
  });
});

describe('verificationEmailOptions', () => {
  it('returns a url when one is usable', () => {
    expect(verificationEmailOptions('https://shipin.example.com')).toEqual({
      url: 'https://shipin.example.com/verify-email',
    });
  });

  it('returns no settings rather than settings without a url', () => {
    // Firebase rejects ActionCodeSettings that omit `url`, so the caller must
    // pass no second argument at all.
    expect(verificationEmailOptions('/verify-email')).toBeUndefined();
    expect(verificationEmailOptions('')).toBeUndefined();
  });
});

describe('resendVerificationErrorMessage', () => {
  it('explains the rate limit', () => {
    expect(
      resendVerificationErrorMessage({ code: 'auth/too-many-requests' })
    ).toContain('Too many attempts');
  });

  it('explains a network failure', () => {
    expect(
      resendVerificationErrorMessage({ code: 'auth/network-request-failed' })
    ).toContain('connection');
  });

  it.each(['auth/user-token-expired', 'auth/requires-recent-login'])(
    'asks for a fresh sign-in on %s',
    (code) => {
      expect(resendVerificationErrorMessage({ code })).toContain(
        'Sign in again'
      );
    }
  );

  it.each(['auth/invalid-continue-uri', 'auth/unauthorized-continue-uri'])(
    'points %s at support, since it is a configuration bug',
    (code) => {
      expect(resendVerificationErrorMessage({ code })).toContain(
        'contact support'
      );
    }
  );

  it('falls back for an unknown code or a non-object error', () => {
    const fallback = 'We could not send the verification email. Please try again.';

    expect(resendVerificationErrorMessage({ code: 'auth/internal-error' })).toBe(
      fallback
    );
    expect(resendVerificationErrorMessage(new Error('boom'))).toBe(fallback);
    expect(resendVerificationErrorMessage(null)).toBe(fallback);
    expect(resendVerificationErrorMessage(undefined)).toBe(fallback);
  });
});

describe('refreshVerifiedToken', () => {
  it('forces a refresh so the new claims are used', async () => {
    const getIdToken = vi.fn(async () => 'fresh-token');

    await refreshVerifiedToken({ getIdToken });

    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it('swallows a refresh failure instead of blocking the user', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const getIdToken = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(refreshVerifiedToken({ getIdToken })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
