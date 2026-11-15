/**
 * Core rights-request module: creation, deadline tracking and lookup.
 *
 * Firestore access is stubbed in this file rather than in a shared helper: the
 * suite runs with `isolate: false`, so a worker shares one module registry and
 * a file whose subject was already evaluated against a different
 * `@/lib/firebaseAdmin` mock would silently reuse that instance. Owning the mock
 * here keeps each file self-contained, and `vi.resetModules()` in the hoisted
 * block clears whatever a previous file left behind before these imports run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getRightsRequest, logRightsRequest as logCoreRightsRequest } from './rightsOps';
import { RIGHTS_DEADLINES } from './rights';

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
    add: vi.fn((_data?: Record<string, unknown>) => ({ id: 'added-id' })),
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


describe('compliance rights request core module', () => {
  it('logCoreRightsRequest applies the statutory deadline for the right', async () => {
    const requests = fakeCollection([fakeDoc({ id: 'unused' })]);
    stubCollections(() => requests);

    const id = await logCoreRightsRequest({
      userId: 'user-1',
      right: 'erasure',
      details: 'Delete me',
    });

    expect(id).toBe('added-id');

    const written = requests.add.mock.calls[0][0] as Record<string, unknown>;
    expect(written).toMatchObject({
      userId: 'user-1',
      right: 'erasure',
      status: 'pending',
      details: 'Delete me',
    });

    const expected = new Date();
    expected.setDate(expected.getDate() + RIGHTS_DEADLINES.erasure);
    expect(
      Math.abs((written.responseDeadline as Date).getTime() - expected.getTime())
    ).toBeLessThan(60_000);
  });

  it('logCoreRightsRequest stores null details when none are given', async () => {
    const requests = fakeCollection([fakeDoc({ id: 'unused' })]);
    stubCollections(() => requests);

    await logCoreRightsRequest({ userId: 'user-1', right: 'access' });

    expect(
      (requests.add.mock.calls[0][0] as Record<string, unknown>).details
    ).toBeNull();
  });

  it('getRightsRequest hydrates Firestore timestamps', async () => {
    const created = new Date('2026-01-01T00:00:00Z');
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: 'rights-3',
          userId: 'user-1',
          right: 'access',
          status: 'completed',
          createdAt: { toDate: () => created },
          updatedAt: { toDate: () => created },
          responseDeadline: { toDate: () => created },
          completedAt: { toDate: () => created },
        }),
      ])
    );

    const result = await getRightsRequest('rights-3');

    expect(result).toMatchObject({ id: 'rights-3', status: 'completed' });
    expect(result?.createdAt).toEqual(created);
    expect(result?.completedAt).toEqual(created);
  });

  it('getRightsRequest returns null for a missing document', async () => {
    stubCollections(() =>
      fakeCollection([fakeDoc({ id: 'other' }, false)])
    );

    await expect(getRightsRequest('missing')).resolves.toBeNull();
  });

  it('getRightsRequest falls back when timestamps are absent', async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({ id: 'rights-4', userId: 'user-1', right: 'grievance', status: 'pending' }),
      ])
    );

    const before = Date.now();
    const result = await getRightsRequest('rights-4');

    expect(result?.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result?.responseDeadline).toBeNull();
    expect(result?.completedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rights escalation and overdue listing (rightsOps2.ts)
// ---------------------------------------------------------------------------
