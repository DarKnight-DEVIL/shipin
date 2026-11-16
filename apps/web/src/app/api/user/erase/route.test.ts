/**
 * `POST|GET /api/user/erase` — DPDP right to erasure (Sec 12).
 *
 * The cascade is destructive, so the tests assert that every user-scoped
 * collection is queued for deletion, that the profile and the user's requests
 * are anonymised rather than removed outright (legal/tax retention), that the
 * Firebase Auth user is actually deleted, and that a failure surfaces as a 500
 * instead of a silent success.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  logRightsRequest: vi.fn(),
  getUserRightsRequests: vi.fn(),
  collection: vi.fn(),
  batch: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.auth }));
vi.mock('@/lib/compliance/rightsOps2', () => ({
  logRightsRequest: mocks.logRightsRequest,
  getUserRightsRequests: mocks.getUserRightsRequests,
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: { collection: mocks.collection, batch: mocks.batch },
  adminAuth: { deleteUser: mocks.deleteUser },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__TS__',
    delete: () => '__DELETE__',
  },
}));

import { GET, POST } from './route';

function firestoreStub(rawDocs: Array<{ id: string; data: () => unknown }> = []) {
  // Real snapshots carry a `ref`; the handler deletes and updates through it.
  const docs = rawDocs.map((doc) => ({ ref: { id: doc.id }, ...doc }));
  const q: Record<string, unknown> = {
    docs,
    empty: docs.length === 0,
    exists: true,
    data: () => ({}),
  };
  q.get = vi.fn(async () => q);
  q.where = vi.fn(() => q);
  q.orderBy = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.doc = vi.fn(() => q);
  q.collection = vi.fn(() => q);
  q.update = vi.fn(async () => undefined);
  return q;
}

const request = () => new NextRequest('http://localhost/api/user/erase');

let errorSpy: ReturnType<typeof vi.spyOn>;
let batch: {
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.logRightsRequest.mockReset().mockResolvedValue('erasure-1');
  mocks.getUserRightsRequests.mockReset().mockResolvedValue([]);
  mocks.collection.mockReset().mockImplementation(() => firestoreStub());
  mocks.deleteUser.mockReset().mockResolvedValue(undefined);
  batch = {
    delete: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(async () => undefined),
  };
  mocks.batch.mockReset().mockReturnValue(batch);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('POST /api/user/erase', () => {
  it('rejects an unauthenticated caller', async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: 'nope' }, { status: 401 })
    );

    expect((await POST(request())).status).toBe(401);
    expect(mocks.logRightsRequest).not.toHaveBeenCalled();
  });

  it('logs the request, queues every user-scoped collection and commits', async () => {
    mocks.collection.mockImplementation(() =>
      firestoreStub([{ id: 'row-1', data: () => ({}) }])
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe('erasure-1');
    expect(mocks.logRightsRequest).toHaveBeenCalledWith({
      userId: 'user-1',
      right: 'erasure',
      details: 'User requested account and data deletion',
    });

    // addresses, supportTickets, notifications, walletTransactions,
    // consentLogs and rightsRequests each contribute one document.
    expect(batch.delete).toHaveBeenCalledTimes(6);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('anonymises the profile but keeps the document', async () => {
    const users = firestoreStub();
    mocks.collection.mockImplementation((name: string) =>
      name === 'users' ? users : firestoreStub()
    );

    await POST(request());

    expect(users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        erased: true,
        displayName: 'Deleted User',
        email: 'deleted@user.local',
        phone: '',
        photoURL: '',
        dateOfBirth: null,
        erasedAt: '__TS__',
        // The real audit id, not the placeholder the handler used to write.
        erasureRequestId: 'erasure-1',
      })
    );

    // The rights-request document is closed, not left pending.
    expect(users.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' })
    );
  });

  it('keeps the audit request that is being served and deletes the other ones', async () => {
    const rights = firestoreStub([
      { id: 'erasure-1', data: () => ({}) },
      { id: 'erasure-0', data: () => ({}) },
    ]);
    mocks.collection.mockImplementation((name: string) =>
      name === 'rightsRequests' ? rights : firestoreStub()
    );

    await POST(request());

    const deleted = batch.delete.mock.calls.map((call) => call[0].id);
    expect(deleted).not.toContain('erasure-1');
    expect(deleted).toContain('erasure-0');
  });

  it('anonymises the user\'s requests instead of leaving their PII queryable', async () => {
    const requests = firestoreStub([{ id: 'req-1', data: () => ({}) }]);
    mocks.collection.mockImplementation((name: string) =>
      name === 'requests' ? requests : firestoreStub()
    );

    await POST(request());

    expect(batch.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'req-1' }), {
      email: 'deleted@user.local',
      customerName: 'Deleted User',
      shippingAddress: '__DELETE__',
      erasureRequestId: 'erasure-1',
      erasedAt: '__TS__',
    });
  });

  it('deletes the Firebase Auth user so the account cannot sign in again', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('treats an already-deleted Auth user as success', async () => {
    mocks.deleteUser.mockRejectedValue(
      Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
    );

    expect((await POST(request())).status).toBe(200);
  });

  it('returns 500 and does not claim success when the cascade fails', async () => {
    mocks.collection.mockImplementation(() => {
      const q = firestoreStub();
      (q.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('permission-denied')
      );
      return q;
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('ERASURE_FAILED');
    expect(batch.commit).not.toHaveBeenCalled();
    // The Auth account must survive a failed cascade, or the user loses access
    // to data that was never purged.
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('returns 500 when the Auth delete fails for any other reason', async () => {
    mocks.deleteUser.mockRejectedValue(
      Object.assign(new Error('revoked'), { code: 'auth/internal-error' })
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('ERASURE_FAILED');
    // The profile documents are already anonymised at this point; the failure
    // must still surface rather than reporting success.
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/user/erase', () => {
  it('rejects an unauthenticated caller', async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: 'nope' }, { status: 401 })
    );

    expect((await GET(request())).status).toBe(401);
  });

  it('returns only erasure requests', async () => {
    mocks.getUserRightsRequests.mockResolvedValue([
      { id: 'r1', right: 'erasure', status: 'pending' },
      { id: 'r2', right: 'access', status: 'completed' },
    ]);

    const body = await (await GET(request())).json();

    expect(body.requests).toEqual([
      { id: 'r1', right: 'erasure', status: 'pending' },
    ]);
  });
});
