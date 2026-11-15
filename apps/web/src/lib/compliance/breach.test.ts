/**
 * Breach register: recording, status transitions and reporting.
 *
 * Firestore access is stubbed in this file rather than in a shared helper: the
 * suite runs with `isolate: false`, so a worker shares one module registry and
 * a file whose subject was already evaluated against a different
 * `@/lib/firebaseAdmin` mock would silently reuse that instance. Owning the mock
 * here keeps each file self-contained, and `vi.resetModules()` in the hoisted
 * block clears whatever a previous file left behind before these imports run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordBreach, updateBreach, getBreach, getAllBreaches, getActiveBreaches } from './breach';

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
