/**
 * Retention sweep: which documents expire and how they are purged.
 *
 * Firestore access is stubbed in this file rather than in a shared helper: the
 * suite runs with `isolate: false`, so a worker shares one module registry and
 * a file whose subject was already evaluated against a different
 * `@/lib/firebaseAdmin` mock would silently reuse that instance. Owning the mock
 * here keeps each file self-contained, and `vi.resetModules()` in the hoisted
 * block clears whatever a previous file left behind before these imports run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import * as retentionOps from './retentionOps';

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


describe('compliance retention sweep', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const deletionLines = () =>
    (errorSpy.mock.calls as unknown[][])
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith('Would delete'));

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns the aggregate result shape', async () => {
    stubCollections(() => fakeCollection([]));

    await expect(retentionOps.executeRetentionCleanup(true)).resolves.toEqual({
      deleted: 0,
      errors: [],
      details: [],
    });
  });

  it('skips documents under any hold flag', async () => {
    stubCollections((name: string) => {
      if (name === 'rightsRequests') return fakeCollection([]);
      return fakeCollection([
        fakeDoc({ id: 'held-1', createdAt: new Date(0), legalHold: true }),
        fakeDoc({ id: 'held-2', createdAt: new Date(0), litigationHold: true }),
        fakeDoc({ id: 'held-3', createdAt: new Date(0), auditHold: true }),
      ]);
    });

    await retentionOps.executeRetentionCleanup(true);

    expect(deletionLines()).toEqual([]);
  });

  it('skips documents whose owner has an open rights request', async () => {
    stubCollections((name: string) => {
      if (name === 'rightsRequests') return fakeCollection([fakeDoc({ id: 'open' })]);
      return fakeCollection([
        fakeDoc({ id: 'doc-1', createdAt: new Date(0), userId: 'user-1' }),
      ]);
    });

    await retentionOps.executeRetentionCleanup(true);

    expect(deletionLines()).toEqual([]);
  });

  it('flags an eligible document for deletion', async () => {
    stubCollections((name: string) => {
      if (name === 'rightsRequests') return fakeCollection([]);
      return fakeCollection([
        fakeDoc({ id: 'old-1', createdAt: new Date(0), userId: 'user-1' }),
      ]);
    });

    await retentionOps.executeRetentionCleanup(true);

    const deleted = deletionLines();
    expect(deleted.length).toBeGreaterThan(0);
    expect(deleted[0]).toContain('old-1');
  });

  it('continues after a collection read throws', async () => {
    stubCollections(() => {
      throw new Error('index missing');
    });

    await expect(retentionOps.executeRetentionCleanup(true)).resolves.toEqual({
      deleted: 0,
      errors: [],
      details: [],
    });

    const lines = (errorSpy.mock.calls as unknown[][]).map((call) =>
      String(call[0])
    );
    expect(lines.some((line) => line.includes('Cleanup error'))).toBe(true);
  });

  it('retentionCleanupHandler reports a dry run', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await retentionOps.retentionCleanupHandler(
      { query: { dryRun: 'true' } },
      { status }
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      dryRun: true,
      deleted: 0,
      errors: [],
      details: [],
    });
  });

  it('retentionCleanupHandler returns 500 when writing fails', async () => {
    const status = vi.fn((code: number) => ({
      json: () => {
        if (code === 200) throw new Error('socket closed');
      },
    }));

    await retentionOps.retentionCleanupHandler(
      { query: {} },
      { status }
    );

    expect(status).toHaveBeenCalledWith(500);
  });

  it('runRetentionCleanupManually logs a dry-run summary', async () => {
    await retentionOps.runRetentionCleanupManually(true);

    const lines = (errorSpy.mock.calls as unknown[][]).map((call) =>
      String(call[0])
    );
    expect(lines.some((line) => line.includes('dryRun: true'))).toBe(true);
  });
});
