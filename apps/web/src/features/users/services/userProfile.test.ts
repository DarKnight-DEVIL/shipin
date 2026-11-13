import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  customerApi: vi.fn(),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
}));

vi.mock('firebase/firestore', () => ({ doc: mocks.doc, getDoc: mocks.getDoc }));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));
vi.mock('@/lib/customerApiClient', () => ({ customerApi: mocks.customerApi }));

import {
  createUserProfile,
  getUserProfile,
  updateUserProfile,
} from './userProfile';

beforeEach(() => {
  mocks.getDoc.mockReset();
  mocks.customerApi.mockReset();
  mocks.customerApi.mockResolvedValue({ success: true });
});

describe('getUserProfile', () => {
  it('returns the stored profile', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Ada', email: 'ada@example.com', phone: '+44' }),
    });

    await expect(getUserProfile('user-1')).resolves.toEqual({
      displayName: 'Ada',
      email: 'ada@example.com',
      phone: '+44',
    });
    expect(mocks.doc).toHaveBeenCalledWith({}, 'users', 'user-1');
  });

  it('returns null when no profile exists', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await expect(getUserProfile('missing')).resolves.toBeNull();
  });
});

describe('createUserProfile', () => {
  it('creates the profile through the customer API', async () => {
    await createUserProfile('user-1', {
      displayName: 'Ada',
      email: 'ada@example.com',
      phone: '+44',
      photoURL: 'https://img/ada.png',
    });

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/profile', {
      method: 'POST',
      body: {
        displayName: 'Ada',
        email: 'ada@example.com',
        phone: '+44',
        photoURL: 'https://img/ada.png',
      },
    });
  });

  it('sends empty strings for optional fields', async () => {
    await createUserProfile('user-1', {
      displayName: 'Ada',
      email: 'ada@example.com',
    });

    expect(mocks.customerApi).toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({
        body: { displayName: 'Ada', email: 'ada@example.com', phone: '', photoURL: '' },
      })
    );
  });

  it('wraps API failures', async () => {
    mocks.customerApi.mockRejectedValue(new Error('permission-denied'));

    await expect(
      createUserProfile('user-1', { displayName: 'A', email: 'a@b.c' })
    ).rejects.toMatchObject({ name: 'AuthorizationError' });
  });
});

describe('updateUserProfile', () => {
  it('patches only the supplied fields', async () => {
    await updateUserProfile('user-1', { displayName: 'Ada Lovelace' });

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      body: { displayName: 'Ada Lovelace' },
    });
  });

  it('wraps API failures', async () => {
    mocks.customerApi.mockRejectedValue(new Error('boom'));

    await expect(updateUserProfile('user-1', { phone: '+1' })).rejects.toBeInstanceOf(Error);
  });
});
