/**
 * Retention sweep: which documents expire and whether they are actually purged.
 *
 * Firestore access is stubbed in this file rather than in a shared helper: the
 * suite runs with `isolate: false`, so a worker shares one module registry and
 * a file whose subject was already evaluated against a different
 * `@/lib/firebaseAdmin` mock would silently reuse that instance. Owning the mock
 * here keeps each file self-contained, and `vi.resetModules()` in the hoisted
 * block clears whatever a previous file left behind before these imports run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as retentionOps from './retentionOps';

vi.hoisted(() => {
  vi.resetModules();
});

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  deleted: [] as string[],
  commit: vi.fn(),
  deleteUser: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function fakeDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    ref: { path: `collection/${id}` },
    data: () => ({ id, ...data }),
  };
}

function fakeQuery(docs: ReturnType<typeof fakeDoc>[]) {
  const query = {
    where: () => query,
    limit: () => query,
    get: () => Promise.resolve({ docs, empty: docs.length === 0 }),
  };
  return query;
}

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: { deleteUser: mocks.deleteUser },
  adminDb: {
    collection: mocks.collection,
    batch: () => ({
      delete: (ref: { path: string }) => {
        mocks.deleted.push(ref.path);
      },
      commit: mocks.commit,
    }),
  },
}));

vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));

function stubCollections(
  factory: (name: string) => ReturnType<typeof fakeQuery>
): void {
  (
    mocks.collection as unknown as {
      mockImplementation: (impl: (name: string) => ReturnType<typeof fakeQuery>) => void;
    }
  ).mockImplementation(factory);
}

const oldDoc = (id: string, extra: Record<string, unknown> = {}) =>
  fakeDoc(id, { createdAt: new Date(0), userId: 'user-1', ...extra });

beforeEach(() => {
  mocks.collection.mockReset().mockImplementation(() => fakeQuery([]));
  mocks.deleted.length = 0;
  mocks.commit.mockReset().mockResolvedValue(undefined);
  mocks.deleteUser.mockReset().mockResolvedValue(undefined);
  mocks.logger.info.mockReset();
  mocks.logger.error.mockReset();
});

describe('compliance retention sweep', () => {
  it('reports expired documents without deleting them in a dry run', async () => {
    stubCollections((name) =>
      name === 'rightsRequests' ? fakeQuery([]) : fakeQuery([oldDoc('old-1')])
    );

    const result = await retentionOps.executeRetentionCleanup(true);

    expect(result.expired).toBeGreaterThan(0);
    expect(result.deleted).toBe(0);
    expect(mocks.deleted).toEqual([]);
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(result.details.some((detail) => detail.docId === 'old-1')).toBe(true);
  });

  it('deletes expired documents through a batch when not a dry run', async () => {
    stubCollections((name) =>
      name === 'rightsRequests' ? fakeQuery([]) : fakeQuery([oldDoc('old-1')])
    );

    const result = await retentionOps.executeRetentionCleanup(false);

    expect(mocks.deleted).toContain('collection/old-1');
    expect(mocks.commit).toHaveBeenCalled();
    expect(result.deleted).toBeGreaterThan(0);
  });

  it('keeps documents under any hold flag', async () => {
    stubCollections((name) =>
      name === 'rightsRequests'
        ? fakeQuery([])
        : fakeQuery([
            oldDoc('held-1', { legalHold: true }),
            oldDoc('held-2', { litigationHold: true }),
            oldDoc('held-3', { auditHold: true }),
          ])
    );

    const result = await retentionOps.executeRetentionCleanup(false);

    expect(mocks.deleted).toEqual([]);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('keeps documents whose owner has an open rights request', async () => {
    stubCollections((name) =>
      name === 'rightsRequests' ? fakeQuery([oldDoc('open')]) : fakeQuery([oldDoc('doc-1')])
    );

    const result = await retentionOps.executeRetentionCleanup(false);

    expect(mocks.deleted).toEqual([]);
    expect(result.expired).toBe(0);
  });

  it('never deletes a live account just because it is old', async () => {
    stubCollections((name) => {
      if (name === 'users') {
        return fakeQuery([
          oldDoc('user-1', { userId: undefined }),
          oldDoc('closed-1', { deletedAt: new Date() }),
        ]);
      }
      return fakeQuery([]);
    });

    await retentionOps.executeRetentionCleanup(false);

    expect(mocks.deleted).toContain('collection/closed-1');
    expect(mocks.deleted).not.toContain('collection/user-1');
  });

  it('deletes the Auth account before removing a closed profile', async () => {
    stubCollections((name) => {
      if (name === 'users') {
        return fakeQuery([oldDoc('closed-1', { deletedAt: new Date() })]);
      }
      return fakeQuery([]);
    });

    await retentionOps.executeRetentionCleanup(false);

    expect(mocks.deleteUser).toHaveBeenCalledWith('closed-1');
    expect(mocks.deleted).toContain('collection/closed-1');
  });

  it('keeps a profile when the Auth account cannot be deleted', async () => {
    mocks.deleteUser.mockRejectedValue({ code: 'auth/internal-error' });
    stubCollections((name) => {
      if (name === 'users') {
        return fakeQuery([oldDoc('closed-2', { deletedAt: new Date() })]);
      }
      return fakeQuery([]);
    });

    const result = await retentionOps.executeRetentionCleanup(false);

    expect(mocks.deleteUser).toHaveBeenCalledWith('closed-2');
    expect(mocks.deleted).not.toContain('collection/closed-2');
    expect(result.errors.some((error) => error.includes('could not delete the Auth account'))).toBe(true);
  });

  it('deletes the profile when the Auth account is already gone', async () => {
    mocks.deleteUser.mockRejectedValue({ code: 'auth/user-not-found' });
    stubCollections((name) => {
      if (name === 'users') {
        return fakeQuery([oldDoc('closed-3', { deletedAt: new Date() })]);
      }
      return fakeQuery([]);
    });

    await retentionOps.executeRetentionCleanup(false);

    expect(mocks.deleted).toContain('collection/closed-3');
  });

  it('does not delete Auth accounts during a dry run', async () => {
    stubCollections((name) => {
      if (name === 'users') {
        return fakeQuery([oldDoc('closed-4', { deletedAt: new Date() })]);
      }
      return fakeQuery([]);
    });

    await retentionOps.executeRetentionCleanup(true);

    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('collects errors and keeps sweeping other collections', async () => {
    stubCollections((name) => {
      if (name === 'requests') throw new Error('index missing');
      return fakeQuery([]);
    });

    const result = await retentionOps.executeRetentionCleanup(true);

    expect(result.errors.some((error) => error.includes('index missing'))).toBe(true);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it('retentionCleanupHandler defaults to a dry run', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await retentionOps.retentionCleanupHandler({ query: {} }, { status });

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, success: true }));
  });

  it('retentionCleanupHandler deletes when dryRun=false', async () => {
    stubCollections((name) =>
      name === 'rightsRequests' ? fakeQuery([]) : fakeQuery([oldDoc('old-1')])
    );
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await retentionOps.retentionCleanupHandler({ query: { dryRun: 'false' } }, { status });

    expect(mocks.deleted).toContain('collection/old-1');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
  });

  it('retentionCleanupHandler returns 500 when the sweep throws', async () => {
    mocks.logger.info.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await retentionOps.retentionCleanupHandler(
      { query: { dryRun: 'false' } },
      { status }
    );

    expect(status).toHaveBeenCalledWith(500);
  });

  it('runRetentionCleanupManually returns the result it logged', async () => {
    const result = await retentionOps.runRetentionCleanupManually(true);

    expect(result).toEqual(expect.objectContaining({ deleted: 0, expired: 0 }));
    expect(mocks.logger.info).toHaveBeenCalledWith(
      'Manual retention cleanup finished',
      expect.objectContaining({ dryRun: true })
    );
  });
});
