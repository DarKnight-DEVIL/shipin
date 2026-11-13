// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  user: null as null | { uid: string },
  unsubscribe: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  auth: {
    currentUser: null as null | { uid: string },
    onAuthStateChanged: vi.fn(),
  },
}));

vi.mock('@/lib/firebase', () => ({ auth: mocks.auth }));
vi.mock('@/features/notifications/services', () => ({
  getNotificationPreferences: mocks.getNotificationPreferences,
  saveNotificationPreferences: mocks.saveNotificationPreferences,
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { useNotificationSettings } from './useNotificationSettings';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/notificationPreferences';

beforeEach(() => {
  mocks.getNotificationPreferences
    .mockReset()
    .mockResolvedValue({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  mocks.saveNotificationPreferences.mockReset().mockResolvedValue(undefined);
  Object.values(mocks.toast).forEach((fn) => fn.mockReset());
  mocks.auth.currentUser = { uid: 'user-1' };
  mocks.auth.onAuthStateChanged.mockImplementation((callback: (user: unknown) => unknown) => {
    void callback({ uid: 'user-1' });
    return mocks.unsubscribe;
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mount() {
  const view = renderHook(() => useNotificationSettings());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useNotificationSettings — loading', () => {
  it('stops loading when signed out', async () => {
    mocks.auth.onAuthStateChanged.mockImplementation((callback: (user: unknown) => unknown) => {
      void callback(null);
      return mocks.unsubscribe;
    });
    const { result } = await mount();

    expect(result.current.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();
  });

  it('splits a saved phone into country code and local number', async () => {
    mocks.getNotificationPreferences.mockResolvedValue({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      whatsapp: { phone: '+919876543210', consentedAt: '2026-01-01T00:00:00.000Z' },
    });
    const { result } = await mount();

    expect(result.current.whatsappCountryCode).toBe('+91');
    expect(result.current.whatsappLocalNumber).toBe('9876543210');
    expect(result.current.whatsappConsentChecked).toBe(true);
    expect(result.current.whatsappEditing).toBe(false);
  });

  it('keeps editing on when no verified number is stored', async () => {
    const { result } = await mount();

    expect(result.current.whatsappEditing).toBe(true);
    expect(result.current.whatsappConsentChecked).toBe(false);
  });

  it('survives a load failure', async () => {
    mocks.getNotificationPreferences.mockRejectedValue(new Error('offline'));
    const { result } = await mount();

    expect(result.current.loading).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useNotificationSettings());
    unmount();

    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
});

describe('useNotificationSettings — toggles', () => {
  it('flips a channel', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.toggleChannel('email');
    });
    expect(result.current.preferences.channels.email).toBe(false);

    await act(async () => {
      result.current.toggleChannel('whatsapp');
    });
    expect(result.current.preferences.channels.whatsapp).toBe(true);
  });

  it('flips a category', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.toggleCategory('support');
    });
    expect(result.current.preferences.categories.support).toBe(false);
    expect(result.current.preferences.categories.quote).toBe(true);
  });
});

describe('useNotificationSettings — saving', () => {
  async function enableWhatsapp(number: string, consent: boolean) {
    const view = await mount();
    await act(async () => {
      view.result.current.toggleChannel('whatsapp');
      view.result.current.setWhatsappLocalNumber(number);
      view.result.current.setWhatsappConsentChecked(consent);
    });
    return view;
  }

  it('requires a signed-in user', async () => {
    const { result } = await mount();
    mocks.auth.currentUser = null;

    await act(async () => {
      await result.current.save('channels');
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith('Please sign in first.');
  });

  it('rejects a number that is too short', async () => {
    const { result } = await enableWhatsapp('123', true);

    await act(async () => {
      await result.current.save('whatsapp');
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith('Enter a valid WhatsApp number.');
    expect(mocks.saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it('rejects a number that is too long', async () => {
    const { result } = await enableWhatsapp('1'.repeat(20), true);

    await act(async () => {
      await result.current.save('whatsapp');
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith('Enter a valid WhatsApp number.');
  });

  it('requires consent before saving WhatsApp', async () => {
    const { result } = await enableWhatsapp('9876543210', false);

    await act(async () => {
      await result.current.save('whatsapp');
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'Confirm consent to receive transactional WhatsApp updates.'
    );
  });

  it('saves a consented WhatsApp number with the country code', async () => {
    const { result } = await enableWhatsapp('98765-43210', true);

    await act(async () => {
      await result.current.save('whatsapp');
    });

    const [, saved] = mocks.saveNotificationPreferences.mock.calls[0];
    expect(saved.whatsapp.phone).toBe('+919876543210');
    expect(saved.whatsapp.consentedAt).toBeTruthy();
    expect(result.current.whatsappEditing).toBe(false);
    expect(mocks.toast.success).toHaveBeenCalledWith('WhatsApp settings saved');
    expect(result.current.savingTarget).toBeNull();
  });

  it('keeps an existing consent timestamp', async () => {
    mocks.getNotificationPreferences.mockResolvedValue({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels, whatsapp: true },
      whatsapp: { phone: '+919876543210', consentedAt: '2026-01-01T00:00:00.000Z' },
    });
    const { result } = await mount();

    await act(async () => {
      await result.current.save('whatsapp');
    });

    const [, saved] = mocks.saveNotificationPreferences.mock.calls[0];
    expect(saved.whatsapp.consentedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('clears consent when WhatsApp is switched off', async () => {
    mocks.getNotificationPreferences.mockResolvedValue({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      whatsapp: { phone: '+919876543210', consentedAt: '2026-01-01T00:00:00.000Z' },
    });
    const { result } = await mount();

    await act(async () => {
      await result.current.save('channels');
    });

    const [, saved] = mocks.saveNotificationPreferences.mock.calls[0];
    expect(saved.whatsapp.consentedAt).toBeUndefined();
    expect(mocks.toast.success).toHaveBeenCalledWith('Channels saved');
  });

  it('reports a saved category selection', async () => {
    const { result } = await mount();

    await act(async () => {
      await result.current.save('types');
    });

    expect(mocks.toast.success).toHaveBeenCalledWith('Notification types saved');
  });

  it('reports a save failure', async () => {
    mocks.saveNotificationPreferences.mockRejectedValue(new Error('offline'));
    const { result } = await mount();

    await act(async () => {
      await result.current.save('types');
    });

    expect(mocks.toast.error).toHaveBeenCalledWith("Couldn't save preferences");
    expect(result.current.savingTarget).toBeNull();
  });
});
