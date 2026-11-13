import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({ add: mocks.add }),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which mocks this module binds to, so a static import
// can inherit another file's stub.
let recordAdminAudit: typeof import('./adminAudit').recordAdminAudit;

beforeEach(async () => {
  vi.resetModules();
  ({ recordAdminAudit } = await import('./adminAudit'));
});

describe('recordAdminAudit', () => {
  beforeEach(() => {
    mocks.add.mockReset();
    mocks.add.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('writes actor, action, target and timestamp to adminAuditLog', async () => {
    await recordAdminAudit({
      actorUid: 'admin-1',
      actorEmail: 'admin@shipin.test',
      action: 'wallet.credit',
      targetType: 'user',
      targetId: 'cust-9',
      detail: { amount: 250, type: 'admin_credit' },
    });

    expect(mocks.add).toHaveBeenCalledWith({
      actorUid: 'admin-1',
      actorEmail: 'admin@shipin.test',
      action: 'wallet.credit',
      targetType: 'user',
      targetId: 'cust-9',
      detail: { amount: 250, type: 'admin_credit' },
      createdAt: '__SERVER_TS__',
    });
  });

  it('defaults optional fields to null', async () => {
    await recordAdminAudit({
      actorUid: 'admin-2',
      action: 'mfa.reset',
      targetType: 'user',
      targetId: 'cust-3',
    });

    expect(mocks.add).toHaveBeenCalledWith(
      expect.objectContaining({ actorEmail: null, detail: null })
    );
  });

  it('never rejects when the write fails, and logs the action', async () => {
    mocks.add.mockRejectedValue(new Error('permission-denied'));

    await expect(
      recordAdminAudit({
        actorUid: 'admin-1',
        actorEmail: 'admin@shipin.test',
        action: 'refund.initiated',
        targetType: 'request',
        targetId: 'req-1',
      })
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      'Admin audit log write failed:',
      expect.objectContaining({
        action: 'refund.initiated',
        targetId: 'req-1',
        actorUid: 'admin-1',
        error: 'Error',
      })
    );
  });
});
