import { describe, it, expect, vi, beforeEach } from 'vitest';

import { calculateAge, isChild } from './ageVerification';
import { hasLegalHold, shouldHardDelete, getCollectionsForCategory } from './retentionCore';
import { recordBreach, updateBreach, getBreach, getAllBreaches, getActiveBreaches } from './breach';
import { logRightsRequest, getUserRightsRequests, updateRightsRequest, getPendingRightsRequests, getAllRightsRequests } from './rightsOps2';
import { logConsent, getUserConsentState, updateUserConsent, getConsentLog, getGrantedCategories, hasValidConsent, withdrawConsent } from './consent';
import { hasParentalConsent, enforceAgeGate } from './ageOps';
import { PERSONAL_DATA_CATEGORIES, LAWFUL_BASES, PROCESSING_REGISTER, DATA_SUBJECT_RIGHTS } from './dpdp';
import { RIGHTS_DEADLINES } from './rights';

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
    add: vi.fn(() => ({ id: 'added-id' })),
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
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: mocks.adminDb,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
  },
}));

beforeEach(() => {
  mocks.adminDb.collection.mockReset();
  mocks.adminDb.collection.mockImplementation(() => fakeCollection([]));
  mocks.serverTimestamp.mockReset();
  mocks.serverTimestamp.mockImplementation(() => ({ toDate: () => new Date() }));
});

// ---------------------------------------------------------------------------
// Pure compliance helpers (no Firestore)
// ---------------------------------------------------------------------------

describe('compliance dpdp types', () => {
  it('exports the expected personal data categories', () => {
    expect(Object.keys(PERSONAL_DATA_CATEGORIES)).toEqual([
      'ACCOUNT',
      'SHIPPING',
      'ORDER',
      'PAYMENT',
      'SUPPORT',
      'AUTH',
      'ANALYTICS',
      'MARKETING',
      'COOKIE',
    ]);
  });

  it('exports lawful bases', () => {
    expect(Object.keys(LAWFUL_BASES)).toEqual([
      'CONSENT',
      'CONTRACT',
      'LEGAL_OBLIGATION',
      'VITAL_INTERESTS',
      'PUBLIC_TASK',
      'LEGITIMATE_INTERESTS',
    ]);
  });

  it('PROCESSING_REGISTER covers every category', () => {
    for (const category of Object.values(PERSONAL_DATA_CATEGORIES)) {
      const entry = PROCESSING_REGISTER[category];
      expect(entry).toBeDefined();
      expect(entry.purposes).toBeInstanceOf(Array);
      expect(entry.thirdParties).toBeInstanceOf(Array);
      expect(entry.safeguards).toBeDefined();
    }
  });

  it('RIGHTS_DEADLINES covers every data subject right', () => {
    for (const right of Object.values(DATA_SUBJECT_RIGHTS)) {
      const deadline = RIGHTS_DEADLINES[right];
      expect(deadline).toBeGreaterThan(0);
      expect(typeof deadline).toBe('number');
    }
  });
});

describe('compliance age verification (pure)', () => {
  it('calculateAge returns the right age for a known birthday', () => {
    // Anchor a birthday exactly one year ago plus one day to avoid
    // boundary ambiguity on the run date.
    const today = new Date();
    const dob = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate() - 1);
    expect(calculateAge(dob.toISOString())).toBe(25);
  });

  it('isChild returns true for an under-18 birthday', () => {
    const today = new Date();
    const dob = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate() + 1);
    expect(isChild(dob.toISOString())).toBe(true);
  });

  it('isChild returns false for an over-18 birthday', () => {
    const today = new Date();
    const dob = new Date(today.getFullYear() - 19, today.getMonth(), today.getDate() - 1);
    expect(isChild(dob.toISOString())).toBe(false);
  });

  it('isChild returns false when DOB is omitted', () => {
    expect(isChild()).toBe(false);
  });
});

describe('compliance retention helpers (pure)', () => {
  it('getCollectionsForCategory returns the documented map', () => {
    expect(getCollectionsForCategory('account')).toEqual(['users']);
    expect(getCollectionsForCategory('payment')).toEqual([
      'walletTransactions',
      'paypalPaymentOrders',
      'requests',
    ]);
    expect(getCollectionsForCategory('marketing')).toEqual(['users']);
    expect(getCollectionsForCategory('unknown')).toEqual([]);
  });

  it('hasLegalHold recognises the documented hold flags', () => {
    expect(hasLegalHold('account', { legalHold: true })).toBe(true);
    expect(hasLegalHold('account', { litigationHold: true })).toBe(true);
    expect(hasLegalHold('account', { auditHold: true })).toBe(true);
    expect(hasLegalHold('account', {})).toBe(false);
    expect(hasLegalHold('account', { legalHold: false })).toBe(false);
  });

  it('shouldHardDelete lists the documented hard-delete categories', () => {
    expect(shouldHardDelete('analytics')).toBe(true);
    expect(shouldHardDelete('marketing')).toBe(true);
    expect(shouldHardDelete('cookie')).toBe(true);
    expect(shouldHardDelete('auth')).toBe(true);
    expect(shouldHardDelete('shipping')).toBe(false);
    expect(shouldHardDelete('account')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Firestore-backed compliance modules (with stubs)
// ---------------------------------------------------------------------------

describe('compliance breach ops', () => {
  it('recordBreach returns an id and writes the expected fields', async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    collection.add.mockReturnValue({ id: 'breach-1' });

    const id = await recordBreach({
      severity: 'high',
      description: 'Test breach',
      affectedCategories: ['account'],
      estimatedAffectedUsers: 10,
      discoveredAt: new Date('2026-01-01'),
      reportedToBoard: false,
      reportedToUsers: false,
    });

    expect(id).toBe('breach-1');
    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'high',
        description: 'Test breach',
        estimatedAffectedUsers: 10,
        reportedToBoard: false,
        reportedToUsers: false,
        status: 'open',
      })
    );
  });

  it('recordBreach logs a critical breach to stderr', async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    collection.add.mockReturnValue({ id: 'breach-2' });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await recordBreach({
      severity: 'critical',
      description: 'Critical breach',
      affectedCategories: ['payment'],
      estimatedAffectedUsers: 1,
      discoveredAt: new Date(),
      reportedToBoard: true,
      reportedToUsers: false,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL BREACH RECORDED'),
      expect.any(String),
      expect.objectContaining({ severity: 'critical' })
    );
    errorSpy.mockRestore();
  });

  it('updateBreach updates only the requested fields', async () => {
    const stored: Record<string, unknown> = { severity: 'low', id: 'b-1' };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    await updateBreach('b-1', {
      status: 'resolved',
      reportedToBoard: true,
    });

    expect(mocks.adminDb.collection).toHaveBeenCalledWith('dataBreaches');
    expect(collection.doc('b-1').update).toHaveBeenCalledOnce();
  });

  it('getBreach returns null for a missing doc', async () => {
    const collection = fakeCollection([fakeDoc({}, false)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getBreach('missing');
    expect(result).toBeNull();
  });

  it('getBreach maps a stored record to the typed shape', async () => {
    const stored: Record<string, unknown> = {
      severity: 'high',
      description: 'Stored breach',
      affectedCategories: ['account'],
      estimatedAffectedUsers: 5,
      reportedToBoard: true,
      reportedToUsers: true,
      status: 'contained',
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getBreach('b-1');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'doc-id',
        severity: 'high',
        description: 'Stored breach',
        estimatedAffectedUsers: 5,
        reportedToBoard: true,
        reportedToUsers: true,
        status: 'contained',
      })
    );
  });

  it('getAllBreaches returns every doc in the query result', async () => {
    const stored: Record<string, unknown> = {
      severity: 'low',
      description: 'Low breach',
      affectedCategories: [],
      estimatedAffectedUsers: 0,
      reportedToBoard: false,
      reportedToUsers: false,
      status: 'open',
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getAllBreaches(undefined, 50);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('low');
  });

  it('getActiveBreaches only returns open or contained records', async () => {
    const stored: Record<string, unknown> = {
      severity: 'high',
      description: 'Active breach',
      affectedCategories: ['payment'],
      estimatedAffectedUsers: 0,
      reportedToBoard: false,
      reportedToUsers: false,
      status: 'open',
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getActiveBreaches();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('open');
  });
});

describe('compliance rights ops', () => {
  it('logRightsRequest creates a request with the correct deadline', async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    collection.add.mockReturnValue({ id: 'req-1' });

    const id = await logRightsRequest({
      userId: 'u-1',
      right: 'erasure',
      details: 'Please erase my data',
    });

    expect(id).toBe('req-1');
    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        right: 'erasure',
        status: 'pending',
        details: 'Please erase my data',
      })
    );
  });

  it('getUserRightsRequests returns every request for the user', async () => {
    const stored: Record<string, unknown> = {
      userId: 'u-1',
      right: 'access',
      status: 'completed',
      details: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      responseDeadline: null,
      completedAt: new Date(),
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getUserRightsRequests('u-1');
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u-1');
    expect(result[0].right).toBe('access');
  });

  it('updateRightsRequest writes status and optional response/assignee', async () => {
    const stored: Record<string, unknown> = { userId: 'u-1', right: 'access', status: 'pending', id: 'req-1' };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    await updateRightsRequest('req-1', 'completed', 'Done', 'dpo');

    expect(mocks.adminDb.collection).toHaveBeenCalledWith('rightsRequests');
    expect(collection.doc('req-1').update).toHaveBeenCalledOnce();
  });

  it('getPendingRightsRequests only returns pending/processing/on_hold requests', async () => {
    const stored: Record<string, unknown> = {
      userId: 'u-1',
      right: 'correction',
      status: 'on_hold',
      details: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      responseDeadline: null,
      completedAt: undefined,
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getPendingRightsRequests('u-1');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('on_hold');
  });

  it('getAllRightsRequests supports filtering by status', async () => {
    const stored: Record<string, unknown> = {
      userId: 'u-1',
      right: 'access',
      status: 'completed',
      details: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      responseDeadline: null,
      completedAt: new Date(),
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getAllRightsRequests('completed', 100);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Consent ops
// ---------------------------------------------------------------------------

describe('compliance consent ops', () => {
  it('logConsent writes the expected audit entry', async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    collection.add.mockReturnValue({ id: 'log-1' });

    await logConsent({
      userId: 'u-1',
      category: 'account',
      granted: true,
      version: '1',
      method: 'explicit',
      ip: '1.2.3.4',
      userAgent: 'test',
    });

    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        category: 'account',
        granted: true,
        version: '1',
        method: 'explicit',
      })
    );
  });

  it('getUserConsentState returns the latest entry per category', async () => {
    const older: Record<string, unknown> = {
      userId: 'u-1',
      category: 'account',
      granted: false,
      version: '0',
      method: 'implied',
      timestamp: new Date('2025-01-01'),
    };
    const newer: Record<string, unknown> = {
      userId: 'u-1',
      category: 'account',
      granted: true,
      version: '1',
      method: 'explicit',
      timestamp: new Date('2026-01-01'),
    };
    const collection = fakeCollection([fakeDoc(newer), fakeDoc(older)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const state = await getUserConsentState('u-1');
    expect(state.account.granted).toBe(true);
    expect(state.account.version).toBe('1');
    expect(state.account.method).toBe('explicit');
  });

  it('updateUserConsent writes both the log and the quick-lookup doc', async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    const userConsentDoc = { set: vi.fn().mockResolvedValue(undefined) };
    collection.doc = vi.fn().mockReturnValue(userConsentDoc as unknown as ReturnType<typeof fakeCollection>['doc']);

    await updateUserConsent({
      userId: 'u-1',
      category: 'marketing',
      granted: false,
      version: '2',
      method: 'withdrawn',
      ip: '1.2.3.4',
    });

    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        category: 'marketing',
        granted: false,
        version: '2',
        method: 'withdrawn',
        ip: '1.2.3.4',
      })
    );
    expect(userConsentDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({
        marketing: expect.objectContaining({
          granted: false,
          version: '2',
          method: 'withdrawn',
        }),
      }),
      expect.objectContaining({ merge: true })
    );
  });

  it('getConsentLog returns the most recent entries in descending order', async () => {
    const log1: Record<string, unknown> = {
      userId: 'u-1',
      category: 'account',
      granted: true,
      version: '1',
      method: 'explicit',
      timestamp: new Date('2026-01-01'),
      ip: '1.2.3.4',
      userAgent: 'a',
    };
    const log2: Record<string, unknown> = {
      userId: 'u-1',
      category: 'marketing',
      granted: false,
      version: '2',
      method: 'withdrawn',
      timestamp: new Date('2026-02-01'),
      ip: '1.2.3.4',
      userAgent: 'b',
    };
    const collection = fakeCollection([fakeDoc(log2), fakeDoc(log1)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const logs = await getConsentLog('u-1', 10);
    expect(logs).toHaveLength(2);
    expect(logs[0].category).toBe('marketing');
    expect(logs[0].timestamp).toEqual(new Date('2026-02-01'));
  });

  it('getGrantedCategories returns only granted categories', async () => {
    const granted: Record<string, unknown> = {
      userId: 'u-1',
      category: 'account',
      granted: true,
      version: '1',
      method: 'explicit',
      timestamp: new Date(),
    };
    const denied: Record<string, unknown> = {
      userId: 'u-1',
      category: 'marketing',
      granted: false,
      version: '1',
      method: 'withdrawn',
      timestamp: new Date(),
    };
    const collection = fakeCollection([fakeDoc(denied), fakeDoc(granted)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const cats = await getGrantedCategories('u-1');
    expect(cats).toEqual(['account']);
  });

  it('hasValidConsent returns false for a withdrawn category', async () => {
    const accountEntry: Record<string, unknown> = {
      userId: 'u-1',
      category: 'account',
      granted: true,
      version: '1',
      method: 'explicit',
      timestamp: mocks.serverTimestamp(),
    };
    const marketingEntry: Record<string, unknown> = {
      userId: 'u-1',
      category: 'marketing',
      granted: false,
      version: '1',
      method: 'withdrawn',
      timestamp: mocks.serverTimestamp(),
    };
    const collection = fakeCollection([fakeDoc(accountEntry), fakeDoc(marketingEntry)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const hasAccount = await hasValidConsent('u-1', 'account');
    const hasMarketing = await hasValidConsent('u-1', 'marketing');
    expect(hasAccount).toBe(true);
    expect(hasMarketing).toBe(false);
  });

  it('withdrawConsent logs the withdrawal', async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    collection.add.mockReturnValue({ id: 'wd-1' });

    await withdrawConsent('u-1', 'analytics', '2', '1.2.3.4', 'test');

    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        category: 'analytics',
        granted: false,
        version: '2',
        method: 'withdrawn',
        ip: '1.2.3.4',
        userAgent: 'test',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// User-facing route logic (the actual 0%-coverage routes)
// ---------------------------------------------------------------------------

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
