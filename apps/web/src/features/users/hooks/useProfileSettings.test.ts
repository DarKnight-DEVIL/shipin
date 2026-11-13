// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  updateAuthProfile: vi.fn(),
  getUserProfile: vi.fn(),
  createUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  auth: {
    currentUser: null as null | Record<string, unknown>,
    onAuthStateChanged: vi.fn(),
  },
}));

vi.mock('firebase/auth', () => ({ updateProfile: mocks.updateAuthProfile }));
vi.mock('@/lib/firebase', () => ({ auth: mocks.auth }));
vi.mock('@/features/users/services/userProfile', () => ({
  getUserProfile: mocks.getUserProfile,
  createUserProfile: mocks.createUserProfile,
  updateUserProfile: mocks.updateUserProfile,
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { useProfileSettings } from './useProfileSettings';

const completeProfile = {
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+44 20 7946 0000',
  photoURL: 'https://img/ada.png',
};

let firebaseUser: Record<string, unknown>;

beforeEach(() => {
  firebaseUser = {
    uid: 'user-1',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    phoneNumber: null,
    photoURL: 'https://img/ada.png',
    providerData: [{ providerId: 'password' }, { providerId: 'google.com' }],
  };
  mocks.auth.currentUser = firebaseUser;
  mocks.auth.onAuthStateChanged.mockImplementation((callback: (user: unknown) => unknown) => {
    void callback(firebaseUser);
    return vi.fn();
  });
  mocks.getUserProfile.mockReset().mockResolvedValue(completeProfile);
  mocks.createUserProfile.mockReset().mockResolvedValue(undefined);
  mocks.updateUserProfile.mockReset().mockResolvedValue(undefined);
  mocks.updateAuthProfile.mockReset().mockResolvedValue(undefined);
  Object.values(mocks.toast).forEach((fn) => fn.mockReset());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mount() {
  const view = renderHook(() => useProfileSettings());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useProfileSettings — loading', () => {
  it('uses a complete stored profile without writing', async () => {
    const { result } = await mount();

    expect(result.current.profile).toEqual({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+44 20 7946 0000',
    });
    expect(mocks.createUserProfile).not.toHaveBeenCalled();
    expect(mocks.updateUserProfile).not.toHaveBeenCalled();
  });

  it('detects the linked providers', async () => {
    const { result } = await mount();

    expect(result.current.hasPasswordProvider).toBe(true);
    expect(result.current.hasGoogleProvider).toBe(true);
  });

  it('creates a missing profile then reloads it', async () => {
    mocks.getUserProfile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completeProfile);

    const { result } = await mount();

    expect(mocks.createUserProfile).toHaveBeenCalledWith('user-1', {
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '',
      photoURL: 'https://img/ada.png',
    });
    expect(result.current.profile.displayName).toBe('Ada Lovelace');
  });

  it('syncs a changed Firebase photo onto the profile', async () => {
    mocks.getUserProfile
      .mockResolvedValueOnce({ ...completeProfile, photoURL: 'https://img/old.png' })
      .mockResolvedValueOnce(completeProfile);

    await mount();

    expect(mocks.updateUserProfile).toHaveBeenCalledWith('user-1', {
      photoURL: 'https://img/ada.png',
    });
  });

  it('stops loading when signed out', async () => {
    mocks.auth.onAuthStateChanged.mockImplementation((callback: (user: unknown) => unknown) => {
      void callback(null);
      return vi.fn();
    });
    const { result } = await mount();

    expect(result.current.loading).toBe(false);
    expect(mocks.getUserProfile).not.toHaveBeenCalled();
    expect(result.current.profile).toEqual({ displayName: '', email: '', phone: '' });
  });

  it('survives a load failure', async () => {
    mocks.getUserProfile.mockRejectedValue(new Error('offline'));
    const { result } = await mount();

    expect(result.current.loading).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('useProfileSettings — editing', () => {
  it('updates a single field', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.setField('phone', '+1 555 0100');
    });

    expect(result.current.profile.phone).toBe('+1 555 0100');
    expect(result.current.profile.displayName).toBe('Ada Lovelace');
  });

  it('toggles edit mode', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.setEditing(true);
    });
    expect(result.current.editing).toBe(true);
  });
});

describe('useProfileSettings — saving', () => {
  it('requires a signed-in user', async () => {
    const { result } = await mount();
    mocks.auth.currentUser = null;

    await act(async () => {
      await result.current.save();
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith('Please sign in first.');
  });

  it('requires a display name', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.setField('displayName', '   ');
    });
    await act(async () => {
      await result.current.save();
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith('Please enter your name.');
    expect(mocks.updateUserProfile).not.toHaveBeenCalled();
  });

  it('saves the trimmed values to the profile and the auth user', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.setField('displayName', '  Ada L  ');
      result.current.setField('phone', '  +44 1  ');
      result.current.setEditing(true);
    });
    await act(async () => {
      await result.current.save();
    });

    expect(mocks.updateUserProfile).toHaveBeenCalledWith('user-1', {
      displayName: 'Ada L',
      phone: '+44 1',
    });
    expect(mocks.updateAuthProfile).toHaveBeenCalledWith(firebaseUser, { displayName: 'Ada L' });
    expect(result.current.profile.displayName).toBe('Ada L');
    expect(result.current.editing).toBe(false);
    expect(mocks.toast.success).toHaveBeenCalledWith('Profile updated');
    expect(result.current.saving).toBe(false);
  });

  it('reports a save failure', async () => {
    mocks.updateUserProfile.mockRejectedValue(new Error('permission-denied'));
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith("Couldn't update profile");
    expect(result.current.saving).toBe(false);
  });
});
