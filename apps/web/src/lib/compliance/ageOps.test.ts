/**
 * Age gate and parental-consent flow.
 *
 * Firestore access is stubbed in this file rather than in a shared helper: the
 * suite runs with `isolate: false`, so a worker shares one module registry and
 * a file whose subject was already evaluated against a different
 * `@/lib/firebaseAdmin` mock would silently reuse that instance. Owning the mock
 * here keeps each file self-contained, and `vi.resetModules()` in the hoisted
 * block clears whatever a previous file left behind before these imports run.
 */
import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { hasParentalConsent, enforceAgeGate, verifyParentalConsent, verifyParentalConsentOTP, getUserAge } from './ageOps';

// Runs before this file's imports are evaluated, so the subjects below bind to
// the stubs declared in this file.
vi.hoisted(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Shared stubs for the Firestore-backed compliance modules.
// ---------------------------------------------------------------------------

function fakeDoc(data: Record<string, unknown>, exists = true) {
  const safeData = { id: 'doc-id', ...data };
  const snap = {
    exists,
    data: () => safeData,
    id: safeData.id as string,
  };
  return {
    ...snap,
    get: () => Promise.resolve(snap),
    update: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeCollection(docs: ReturnType<typeof fakeDoc>[]) {
  return {
    doc: (id?: string) => docs.find(d => d.data().id === id) || docs[0],
    add: vi.fn((_data?: Record<string, unknown>) => ({
      id: 'added-id',
      delete: vi.fn().mockResolvedValue(undefined),
    })),
    get: () => ({ docs, empty: docs.length === 0 }),
    where: () => fakeCollection(docs),
    orderBy: () => fakeCollection(docs),
    limit: () => fakeCollection(docs),
  };
}

function fakeBatch() {
  return {
    delete: () => {},
    update: () => {},
    commit: () => Promise.resolve(),
  };
}

// Top-level mocks — installed once via vi.mock so subjects imported at the
// top of this file resolve against these stubs automatically.
const mocks = vi.hoisted(() => ({
  adminDb: {
    collection: vi.fn(() => fakeCollection([])),
    batch: fakeBatch,
  },
  // Return a placeholder object that mimics FieldValue.serverTimestamp()'s .toDate()
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date() })),
  sendMail: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: mocks.adminDb,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
    delete: () => '__DELETE__',
  },
}));

vi.mock('@/lib/mailer', () => ({ sendMail: mocks.sendMail }));

beforeEach(() => {
  mocks.adminDb.collection.mockReset();
  mocks.adminDb.collection.mockImplementation(() => fakeCollection([]));
  mocks.serverTimestamp.mockReset();
  mocks.serverTimestamp.mockImplementation(() => ({ toDate: () => new Date() }));
  mocks.sendMail.mockReset().mockResolvedValue(undefined);
});

/**
 * `mocks.adminDb.collection` is declared with no parameters, so a per-test
 * implementation that inspects the requested collection name needs a cast
 * rather than a narrower function type.
 */
function stubCollections(
  factory: (name: string) => ReturnType<typeof fakeCollection>
): void {
  (
    mocks.adminDb.collection as unknown as {
      mockImplementation: (
        impl: (name: string) => ReturnType<typeof fakeCollection>
      ) => void;
    }
  ).mockImplementation(factory);
}


describe('compliance age ops route logic', () => {
  it('hasParentalConsent returns false for a missing user', async () => {
    const collection = fakeCollection([fakeDoc({}, false)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await hasParentalConsent('missing');
    expect(result).toBe(false);
  });

  it('hasParentalConsent returns true only when the flag is exactly true', async () => {
    const presentFalse: Record<string, unknown> = { parentalConsentVerified: false, id: 'false' };
    const presentTrue: Record<string, unknown> = { parentalConsentVerified: true, parentalConsentId: 'pc-1', id: 'true' };
    const collection = fakeCollection([fakeDoc(presentFalse), fakeDoc(presentTrue)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    expect(await hasParentalConsent('false')).toBe(false);
    expect(await hasParentalConsent('true')).toBe(true);
  });

  it('enforceAgeGate allows adults and users without a DOB', async () => {
    const adultNoDob: Record<string, unknown> = {
      displayName: 'Adult',
    };
    const adultWithDob: Record<string, unknown> = {
      dateOfBirth: '2000-01-01',
    };
    const collection = fakeCollection([fakeDoc(adultNoDob), fakeDoc(adultWithDob)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    expect(await enforceAgeGate('no-dob')).toEqual({ allowed: true });
    expect(await enforceAgeGate('adult')).toEqual({ allowed: true });
  });

  it('enforceAgeGate blocks unverified children', async () => {
    const child: Record<string, unknown> = {
      dateOfBirth: '2010-01-01',
    };
    const collection = fakeCollection([fakeDoc(child)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await enforceAgeGate('child');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('parental consent');
  });
});

// ---------------------------------------------------------------------------
// Parental consent request flow (ageOps)
// ---------------------------------------------------------------------------

describe('compliance parental consent flow', () => {
  const future = { toDate: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) };
  const past = { toDate: () => new Date(Date.now() - 24 * 60 * 60 * 1000) };

  it('reuses an already verified consent instead of creating a request', async () => {
    const users = fakeCollection([
      fakeDoc({ id: 'child-1', parentalConsentVerified: true, parentalConsentId: 'pc-old' }),
    ]);
    const consents = fakeCollection([fakeDoc({ id: 'unused' })]);
    stubCollections((name: string) =>
      name === 'users' ? users : consents
    );

    const result = await verifyParentalConsent({
      childUid: 'child-1',
      parentEmail: 'parent@example.com',
      consentMethod: 'otp',
    });

    expect(result).toEqual({ success: true, consentId: 'pc-old' });
    expect(consents.add).not.toHaveBeenCalled();
  });

  it('creates a pending request with a seven day expiry when unverified', async () => {
    const users = fakeCollection([fakeDoc({ id: 'child-2' })]);
    const consents = fakeCollection([fakeDoc({ id: 'unused' })]);
    stubCollections((name: string) =>
      name === 'users' ? users : consents
    );

    const result = await verifyParentalConsent({
      childUid: 'child-2',
      parentEmail: 'parent@example.com',
      consentMethod: 'video_kyc',
    });

    expect(result.success).toBe(true);
    expect(result.consentId).toBe('added-id');
    expect(result.error).toContain('Parental consent required');

    const written = consents.add.mock.calls[0][0] as Record<string, unknown>;
    expect(written).toMatchObject({
      childUid: 'child-2',
      parentEmail: 'parent@example.com',
      method: 'video_kyc',
      status: 'pending',
    });

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = written.expiresAt as Date;
    expect(Math.abs(expiresAt.getTime() - Date.now() - sevenDaysMs)).toBeLessThan(
      60_000
    );
  });

  it('verifyParentalConsentOTP rejects an unknown request', async () => {
    stubCollections(() =>
      fakeCollection([fakeDoc({ id: 'other' }, false)])
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'missing', otp: '123456' })
    ).resolves.toEqual({ success: false, error: 'Invalid consent request' });
  });

  it('verifyParentalConsentOTP rejects an already processed request', async () => {
    stubCollections(() =>
      fakeCollection([fakeDoc({ id: 'consent-1', status: 'verified' })])
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: '123456' })
    ).resolves.toEqual({
      success: false,
      error: 'Consent request already processed',
    });
  });

  it('verifyParentalConsentOTP rejects an expired request', async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({ id: 'consent-1', status: 'pending', expiresAt: past }),
      ])
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: '123456' })
    ).resolves.toEqual({ success: false, error: 'Consent request expired' });
  });

  it('verifyParentalConsentOTP rejects a malformed OTP', async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({ id: 'consent-1', status: 'pending', expiresAt: future }),
      ])
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: 'abc' })
    ).resolves.toEqual({ success: false, error: 'Invalid OTP format' });
  });

  it('verifyParentalConsentOTP verifies a matching code and the child profile', async () => {
    const salt = 'a'.repeat(32);
    const hash = crypto.scryptSync('123456', salt, 32).toString('hex');
    const consents = fakeCollection([
      fakeDoc({
        id: 'consent-1',
        childUid: 'child-3',
        status: 'pending',
        expiresAt: future,
        otpHash: hash,
        otpSalt: salt,
        otpAttempts: 0,
        otpExpiresAt: future,
      }),
    ]);
    const users = fakeCollection([fakeDoc({ id: 'child-3' })]);
    stubCollections((name: string) =>
      name === 'users' ? users : consents
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: '123456' })
    ).resolves.toEqual({ success: true });

    const consentDoc = consents.doc('consent-1') as ReturnType<typeof fakeDoc>;
    expect(consentDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'verified' })
    );

    const childDoc = users.doc('child-3') as ReturnType<typeof fakeDoc>;
    expect(childDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        parentalConsentVerified: true,
        parentalConsentId: 'consent-1',
        parentalConsentMethod: 'otp',
      })
    );
  });

  it('verifyParentalConsentOTP refuses a request with no stored code', async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({ id: 'consent-1', status: 'pending', expiresAt: future }),
      ])
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: '123456' })
    ).resolves.toEqual({
      success: false,
      error: 'This consent request has no verification code. Request a new one.',
    });
  });

  it('verifyParentalConsentOTP increments attempts on a wrong code', async () => {
    const salt = 'b'.repeat(32);
    const consents = fakeCollection([
      fakeDoc({
        id: 'consent-1',
        childUid: 'child-3',
        status: 'pending',
        expiresAt: future,
        otpHash: crypto.scryptSync('111111', salt, 32).toString('hex'),
        otpSalt: salt,
        otpAttempts: 2,
        otpExpiresAt: future,
      }),
    ]);
    stubCollections((name: string) =>
      name === 'users' ? fakeCollection([fakeDoc({ id: 'child-3' })]) : consents
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: '222222' })
    ).resolves.toEqual({ success: false, error: 'Incorrect OTP.' });

    const consentDoc = consents.doc('consent-1') as ReturnType<typeof fakeDoc>;
    expect(consentDoc.update).toHaveBeenCalledWith({ otpAttempts: 3 });
  });

  it('verifyParentalConsentOTP treats a malformed stored hash as a mismatch', async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: 'consent-1',
          status: 'pending',
          expiresAt: future,
          otpHash: 'ab',
          otpSalt: 'e'.repeat(32),
          otpAttempts: 0,
          otpExpiresAt: future,
        }),
      ])
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: '111111' })
    ).resolves.toEqual({ success: false, error: 'Incorrect OTP.' });
  });

  it('verifyParentalConsentOTP locks out after five wrong codes', async () => {
    const salt = 'c'.repeat(32);
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: 'consent-1',
          status: 'pending',
          expiresAt: future,
          otpHash: crypto.scryptSync('111111', salt, 32).toString('hex'),
          otpSalt: salt,
          otpAttempts: 5,
          otpExpiresAt: future,
        }),
      ])
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: '111111' })
    ).resolves.toEqual({
      success: false,
      error: 'Too many attempts. Request a new code.',
    });
  });

  it('verifyParentalConsentOTP rejects a code past its own expiry', async () => {
    const salt = 'd'.repeat(32);
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: 'consent-1',
          status: 'pending',
          expiresAt: future,
          otpHash: crypto.scryptSync('111111', salt, 32).toString('hex'),
          otpSalt: salt,
          otpAttempts: 0,
          otpExpiresAt: past,
        }),
      ])
    );

    await expect(
      verifyParentalConsentOTP({ consentId: 'consent-1', otp: '111111' })
    ).resolves.toEqual({
      success: false,
      error: 'Verification code expired. Request a new one.',
    });
  });

  it('an OTP request stores only a hash and emails the code to the parent', async () => {
    const users = fakeCollection([fakeDoc({ id: 'child-5' })]);
    const consents = fakeCollection([fakeDoc({ id: 'unused' })]);
    stubCollections((name: string) => (name === 'users' ? users : consents));

    await verifyParentalConsent({
      childUid: 'child-5',
      parentEmail: 'parent@example.com',
      consentMethod: 'otp',
    });

    const written = consents.add.mock.calls[0][0] as Record<string, unknown>;
    expect(written.otpHash).toEqual(expect.any(String));
    expect(written.otpSalt).toEqual(expect.any(String));
    expect(written).not.toHaveProperty('otp');

    const mail = mocks.sendMail.mock.calls[0][0] as { to: string; text: string };
    expect(mail.to).toBe('parent@example.com');
    const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
    expect(code).toBeDefined();

    // The emailed code is the one the hash was built from.
    expect(
      crypto.scryptSync(code!, written.otpSalt as string, 32).toString('hex')
    ).toBe(written.otpHash);
  });

  it('an OTP request is discarded when the email cannot be sent', async () => {
    mocks.sendMail.mockRejectedValue(new Error('smtp down'));
    const users = fakeCollection([fakeDoc({ id: 'child-6' })]);
    const consents = fakeCollection([fakeDoc({ id: 'unused' })]);
    stubCollections((name: string) => (name === 'users' ? users : consents));

    await expect(
      verifyParentalConsent({
        childUid: 'child-6',
        parentEmail: 'parent@example.com',
        consentMethod: 'otp',
      })
    ).resolves.toEqual({
      success: false,
      error: 'Could not send the verification email.',
    });
  });

  it('getUserAge returns null for a profile without a date of birth', async () => {
    stubCollections(() =>
      fakeCollection([fakeDoc({ id: 'user-1' })])
    );

    await expect(getUserAge('user-1')).resolves.toBeNull();
  });

  it('getUserAge calculates age from the stored date of birth', async () => {
    stubCollections(() =>
      fakeCollection([fakeDoc({ id: 'user-1', dateOfBirth: '1990-01-01' })])
    );

    await expect(getUserAge('user-1')).resolves.toBeGreaterThanOrEqual(18);
  });

  it('enforceAgeGate allows a minor with verified parental consent', async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: 'child-4',
          dateOfBirth: '2015-01-01',
          parentalConsentVerified: true,
        }),
      ])
    );

    await expect(enforceAgeGate('child-4')).resolves.toEqual({ allowed: true });
  });
});

// ---------------------------------------------------------------------------
// Consent audit fallbacks
// ---------------------------------------------------------------------------
