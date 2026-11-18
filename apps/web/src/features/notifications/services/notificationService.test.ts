import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  addNotification: vi.fn(),
  sendWhatsAppTemplate: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn((name: string) =>
      name === 'users'
        ? { doc: vi.fn(() => ({ get: mocks.getUser })) }
        : { add: mocks.addNotification }
    ),
  },
}));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: mocks.sendWhatsAppTemplate }));
vi.mock('@/lib/mailer', () => ({ sendMail: mocks.sendMail }));

import { sendNotification } from './notificationService';
import { resetNotificationRateLimit } from '@/lib/notificationRateLimit';
import { resetSharedRedisClientForTests } from '@/lib/redisRateLimiter';

const base = {
  userId: 'user-1',
  requestId: 'req-123456',
  title: 'Quote ready',
  message: 'Your quote is waiting.',
  type: 'quote',
  category: 'quote' as const,
};

function user(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    data: () => ({
      email: 'ada@example.com',
      ...overrides,
    }),
  };
}

beforeEach(() => {
  // These cases exercise the in-process bucket. Without this, a fake client
  // cached by an earlier file in the same worker (the suite runs with
  // `isolate: false`) would be used, and a failing INCR now fails closed, so
  // every send would be dropped.
  resetSharedRedisClientForTests();
  resetNotificationRateLimit();
  mocks.getUser.mockReset().mockResolvedValue(user());
  mocks.addNotification.mockReset().mockResolvedValue({ id: 'n-1' });
  mocks.sendWhatsAppTemplate.mockReset().mockResolvedValue(undefined);
  mocks.sendMail.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendNotification — rate limit', () => {
  it('drops the notification once the hourly budget is spent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (let index = 0; index < 10; index += 1) {
      await sendNotification({ ...base, channels: { inApp: true } });
    }

    expect(mocks.addNotification).toHaveBeenCalledTimes(10);

    await sendNotification({ ...base, channels: { inApp: true } });

    expect(mocks.addNotification).toHaveBeenCalledTimes(10);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('rate limit reached')
    );
  });
});

describe('sendNotification — category opt-out', () => {
  it('sends nothing when the customer disabled the category', async () => {
    mocks.getUser.mockResolvedValue(
      user({ preferences: { notifications: { categories: { quote: false } } } })
    );

    await sendNotification({ ...base, channels: { inApp: true, email: true } });

    expect(mocks.addNotification).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe('sendNotification — in-app', () => {
  it('stores the notification by default', async () => {
    await sendNotification(base);

    expect(mocks.addNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      requestId: 'req-123456',
      title: 'Quote ready',
      message: 'Your quote is waiting.',
      type: 'quote',
      category: 'quote',
      read: false,
      createdAt: expect.any(Date),
    });
  });

  it('respects the event channel opt-out', async () => {
    await sendNotification({ ...base, channels: { inApp: false } });

    expect(mocks.addNotification).not.toHaveBeenCalled();
  });

  it('respects the customer channel preference', async () => {
    mocks.getUser.mockResolvedValue(
      user({ preferences: { notifications: { channels: { inApp: false } } } })
    );

    await sendNotification(base);

    expect(mocks.addNotification).not.toHaveBeenCalled();
  });

  it('keeps working when the write fails', async () => {
    mocks.addNotification.mockRejectedValue(new Error('quota'));

    await expect(sendNotification(base)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('In-app notification failed:', expect.any(Error));
  });

  it('falls back to defaults when the user cannot be read', async () => {
    mocks.getUser.mockRejectedValue(new Error('offline'));

    await sendNotification(base);

    expect(mocks.addNotification).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Failed to load user data:', expect.any(Error));
  });

  it('falls back to defaults for a missing user document', async () => {
    mocks.getUser.mockResolvedValue({ exists: false });

    await sendNotification(base);

    expect(mocks.addNotification).toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe('sendNotification — email', () => {
  it('emails the customer when the event and preferences allow it', async () => {
    await sendNotification({ ...base, channels: { email: true } });

    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('ada@example.com');
    expect(mail.subject).toBe('Quote ready - ShipIN');
    expect(mail.html).toContain('Quote ready');
    expect(mail.html).toContain('Your quote is waiting.');
    expect(mail.html).toContain('#req-12');
  });

  it('skips email for an event that does not support it', async () => {
    await sendNotification(base);

    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('skips email when the customer has no address', async () => {
    mocks.getUser.mockResolvedValue(user({ email: '' }));

    await sendNotification({ ...base, channels: { email: true } });

    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('skips email when the preference is off', async () => {
    mocks.getUser.mockResolvedValue(
      user({ preferences: { notifications: { channels: { email: false } } } })
    );

    await sendNotification({ ...base, channels: { email: true } });

    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('keeps working when the mailer fails', async () => {
    mocks.sendMail.mockRejectedValue(new Error('smtp down'));

    await expect(sendNotification({ ...base, channels: { email: true } })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('Email notification failed:', expect.any(Error));
  });
});

describe('sendNotification — WhatsApp', () => {
  const whatsapp = { templateName: 'shipin_payment_received' };

  function consented(overrides: Record<string, unknown> = {}) {
    return user({
      preferences: {
        notifications: {
          channels: { whatsapp: true },
          whatsapp: { phone: '+919876543210', consentedAt: '2026-01-01T00:00:00.000Z' },
          ...overrides,
        },
      },
    });
  }

  it('sends the template with defaults', async () => {
    mocks.getUser.mockResolvedValue(consented());

    await sendNotification({ ...base, channels: { whatsapp: true }, whatsapp });

    expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: '+919876543210',
      templateName: 'shipin_payment_received',
      languageCode: 'en_US',
      components: [],
    });
  });

  it('passes language and components through', async () => {
    mocks.getUser.mockResolvedValue(consented());
    const components = [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }] }];

    await sendNotification({
      ...base,
      channels: { whatsapp: true },
      whatsapp: { templateName: 'shipin_payment_received', languageCode: 'en_GB', components },
    });

    expect(mocks.sendWhatsAppTemplate.mock.calls[0][0]).toMatchObject({
      languageCode: 'en_GB',
      components,
    });
  });

  it('refuses a template that is not registered', async () => {
    mocks.getUser.mockResolvedValue(consented());

    await sendNotification({
      ...base,
      channels: { whatsapp: true },
      whatsapp: { templateName: 'typo_template' },
    });

    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"typo_template" is not a registered template')
    );
  });

  it('still sends the email when the WhatsApp template is unknown', async () => {
    mocks.getUser.mockResolvedValue(
      user({
        email: 'ada@example.com',
        preferences: {
          notifications: {
            channels: { whatsapp: true, email: true },
            whatsapp: { phone: '+919876543210', consentedAt: '2026-01-01T00:00:00.000Z' },
          },
        },
      })
    );

    await sendNotification({
      ...base,
      channels: { whatsapp: true, email: true },
      whatsapp: { templateName: 'typo_template' },
    });

    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
    // The unregistered template skips WhatsApp only; the email still goes out.
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@example.com' })
    );
  });

  it('skips WhatsApp without consent', async () => {
    mocks.getUser.mockResolvedValue(
      user({
        preferences: {
          notifications: { channels: { whatsapp: true }, whatsapp: { phone: '+91987' } },
        },
      })
    );

    await sendNotification({ ...base, channels: { whatsapp: true }, whatsapp });

    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it('skips WhatsApp without a template', async () => {
    mocks.getUser.mockResolvedValue(consented());

    await sendNotification({ ...base, channels: { whatsapp: true } });

    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it('skips WhatsApp for an event that does not support it', async () => {
    mocks.getUser.mockResolvedValue(consented());

    await sendNotification({ ...base, whatsapp });

    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it('keeps working when WhatsApp fails', async () => {
    mocks.getUser.mockResolvedValue(consented());
    mocks.sendWhatsAppTemplate.mockRejectedValue(new Error('meta down'));

    await expect(
      sendNotification({ ...base, channels: { whatsapp: true }, whatsapp })
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('shipin_payment_received'),
      expect.any(Error)
    );
  });
});

describe('sendNotification — ordering', () => {
  it('delivers every enabled channel', async () => {
    mocks.getUser.mockResolvedValue(
      user({
        preferences: {
          notifications: {
            channels: { inApp: true, email: true, whatsapp: true },
            whatsapp: { phone: '+919876543210', consentedAt: '2026-01-01T00:00:00.000Z' },
          },
        },
      })
    );

    await sendNotification({
      ...base,
      channels: { inApp: true, email: true, whatsapp: true },
      whatsapp: { templateName: 'shipin_payment_received' },
    });

    expect(mocks.addNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });
});
