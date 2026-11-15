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
  clearUserProfileCache,
  createUserProfile,
  ensureUserProfile,
  getUserProfile,
  updateUserProfile,
} from './userProfile';

beforeEach(() => {
  // The repair result is cached per account for the tab, so each test starts
  // from an empty cache.
  clearUserProfileCache();
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

describe('ensureUserProfile', () => {
  it('keeps an existing profile and does not write', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Ada', email: 'ada@example.com', phone: '', role: 'customer' }),
    });

    const profile = await ensureUserProfile({
      uid: 'user-1',
      displayName: 'Ada',
      email: 'ada@example.com',
    });

    expect(profile).toMatchObject({ displayName: 'Ada', role: 'customer' });
    expect(mocks.customerApi).not.toHaveBeenCalled();
  });

  it('creates the missing profile for a Google account', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    const profile = await ensureUserProfile({
      uid: 'google-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      photoURL: 'https://img/ada.png',
    });

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/profile', {
      method: 'POST',
      body: {
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '',
        photoURL: 'https://img/ada.png',
      },
    });
    expect(profile).toMatchObject({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      photoURL: 'https://img/ada.png',
    });
  });

  it('derives a display name from the email when Firebase has none', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await ensureUserProfile({ uid: 'user-2', displayName: null, email: 'ada@example.com' });

    expect(mocks.customerApi).toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({
        body: expect.objectContaining({ displayName: 'ada' }),
      })
    );
  });

  it('falls back to a generic name when the account has no name or email', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await ensureUserProfile({ uid: 'user-3' });

    expect(mocks.customerApi).toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({
        body: expect.objectContaining({ displayName: 'ShipIN customer' }),
      })
    );
  });

  it('shares one read between the sign-in flow and the layout that follows', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Ada', email: 'ada@example.com', phone: '', role: 'admin' }),
    });

    // Sign-in reads the profile to pick a destination, then the platform
    // layout repairs the same account as it mounts. One Firestore read.
    const [atSignIn, atLayout] = await Promise.all([
      ensureUserProfile({ uid: 'user-1', email: 'ada@example.com' }),
      ensureUserProfile({ uid: 'user-1', email: 'ada@example.com' }),
    ]);

    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    expect(atSignIn).toBe(atLayout);
    expect(atSignIn).toMatchObject({ role: 'admin' });
  });

  it('keeps the cache per account', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await ensureUserProfile({ uid: 'user-a' });
    await ensureUserProfile({ uid: 'user-b' });

    expect(mocks.getDoc).toHaveBeenCalledTimes(2);
  });

  it('does not cache a repair that failed, so the next caller retries', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    mocks.customerApi.mockRejectedValueOnce(new Error('network down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(ensureUserProfile({ uid: 'user-5', email: 'a@b.co' })).resolves.toBeNull();

    const retried = await ensureUserProfile({ uid: 'user-5', email: 'a@b.co' });

    expect(retried).toMatchObject({ email: 'a@b.co' });
    expect(mocks.customerApi).toHaveBeenCalledTimes(2);

    errorSpy.mockRestore();
  });

  it('does not cache a rejected read', async () => {
    mocks.getDoc.mockRejectedValueOnce(new Error('offline'));

    await expect(ensureUserProfile({ uid: 'user-6' })).rejects.toThrow('offline');

    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Ada', email: 'ada@example.com', phone: '' }),
    });

    await expect(ensureUserProfile({ uid: 'user-6' })).resolves.toMatchObject({
      displayName: 'Ada',
    });
  });

  it('returns null instead of throwing when the repair fails', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    mocks.customerApi.mockRejectedValue(new Error('network down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(ensureUserProfile({ uid: 'user-4', email: 'a@b.co' })).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe('updateUserProfile', () => {
  it('drops the cached repair result so the next reader sees the edit', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: 'Ada', email: 'ada@example.com', phone: '' }),
    });

    await ensureUserProfile({ uid: 'user-7', email: 'ada@example.com' });
    await updateUserProfile('user-7', { displayName: 'Ada Lovelace' });
    await ensureUserProfile({ uid: 'user-7', email: 'ada@example.com' });

    expect(mocks.getDoc).toHaveBeenCalledTimes(2);
  });

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
