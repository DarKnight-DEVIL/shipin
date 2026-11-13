// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FormEvent } from 'react';

const mocks = vi.hoisted(() => ({
  credential: vi.fn((email: string, password: string) => ({ email, password })),
  reauthenticate: vi.fn(),
  updatePassword: vi.fn(),
  auth: { currentUser: null as null | { uid: string; email: string } },
}));

vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: mocks.credential },
  reauthenticateWithCredential: mocks.reauthenticate,
  updatePassword: mocks.updatePassword,
}));
vi.mock('@/lib/firebase', () => ({ auth: mocks.auth }));

import { usePasswordSettings } from './usePasswordSettings';

const event = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent;

beforeEach(() => {
  mocks.reauthenticate.mockReset().mockResolvedValue(undefined);
  mocks.updatePassword.mockReset().mockResolvedValue(undefined);
  mocks.auth.currentUser = { uid: 'user-1', email: 'ada@example.com' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function fill(
  result: { current: ReturnType<typeof usePasswordSettings> },
  values: { current?: string; next?: string; confirm?: string }
) {
  await act(async () => {
    if (values.current !== undefined) result.current.setCurrentPassword(values.current);
    if (values.next !== undefined) result.current.setNewPassword(values.next);
    if (values.confirm !== undefined) result.current.setConfirmPassword(values.confirm);
  });
}

describe('usePasswordSettings — validation', () => {
  it('requires the current password', async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, { next: 'newpass', confirm: 'newpass' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe('Enter your current password.');
    expect(mocks.updatePassword).not.toHaveBeenCalled();
  });

  it('requires six characters for the new password', async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, { current: 'oldpass', next: 'short', confirm: 'short' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe('New password must be at least 6 characters.');
  });

  it('rejects reusing the current password', async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, { current: 'samepass', next: 'samepass', confirm: 'samepass' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe('New password must be different.');
  });

  it('requires matching confirmation', async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, { current: 'oldpass', next: 'newpass', confirm: 'otherpass' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe("New passwords don't match.");
  });

  it('requires a signed-in user', async () => {
    mocks.auth.currentUser = null;
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, { current: 'oldpass', next: 'newpass', confirm: 'newpass' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe('No authenticated user found.');
  });
});

describe('usePasswordSettings — submission', () => {
  it('reauthenticates before updating when the account has a password', async () => {
    const { result } = renderHook(() => usePasswordSettings(true));

    await fill(result, { current: 'oldpass', next: 'newpass', confirm: 'newpass' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(mocks.credential).toHaveBeenCalledWith('ada@example.com', 'oldpass');
    expect(mocks.reauthenticate).toHaveBeenCalled();
    expect(mocks.updatePassword).toHaveBeenCalledWith(mocks.auth.currentUser, 'newpass');
    expect(result.current.message).toBe('Password updated.');
    expect(result.current.currentPassword).toBe('');
    expect(result.current.newPassword).toBe('');
    expect(result.current.confirmPassword).toBe('');
    expect(result.current.changing).toBe(false);
  });

  it('skips reauthentication for social-only accounts', async () => {
    const { result } = renderHook(() => usePasswordSettings(false));

    await fill(result, { current: 'anything', next: 'newpass', confirm: 'newpass' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(mocks.reauthenticate).not.toHaveBeenCalled();
    expect(mocks.updatePassword).toHaveBeenCalled();
  });

  it('surfaces the provider error message', async () => {
    mocks.updatePassword.mockRejectedValue(new Error('weak-password'));
    const { result } = renderHook(() => usePasswordSettings(false));

    await fill(result, { current: 'old', next: 'newpass', confirm: 'newpass' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe('weak-password');
    expect(result.current.changing).toBe(false);
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    mocks.updatePassword.mockRejectedValue('nope');
    const { result } = renderHook(() => usePasswordSettings(false));

    await fill(result, { current: 'old', next: 'newpass', confirm: 'newpass' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.error).toBe('Failed to update password.');
  });

  it('clears stale messages on the next attempt', async () => {
    const { result } = renderHook(() => usePasswordSettings(false));

    await fill(result, { current: 'old', next: 'newpass', confirm: 'newpass' });
    await act(async () => {
      await result.current.submit(event());
    });
    expect(result.current.message).toBe('Password updated.');

    await fill(result, { current: '', next: '', confirm: '' });
    await act(async () => {
      await result.current.submit(event());
    });

    expect(result.current.message).toBe('');
    expect(result.current.error).toBe('Enter your current password.');
  });
});
