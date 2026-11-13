/**
 * Tests for the mailer's provider selection and fallback behaviour.
 *
 * The module caches its provider on first send, so every test re-imports it
 * with a fresh module registry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  send: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  readEnv: (key: string) => mocks.env[key],
  serverEnv: {},
  clientEnv: {},
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}));

vi.mock('@/lib/logger', () => ({
  childLogger: () => ({
    error: mocks.logError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

const message = {
  to: 'customer@example.com',
  subject: 'Quote ready',
  html: '<p>hi</p>',
};

async function loadMailer() {
  vi.resetModules();
  return import('./mailer');
}

beforeEach(() => {
  for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  mocks.send.mockReset();
  mocks.createTransport.mockReset();
  mocks.sendMail.mockReset();
  mocks.logError.mockReset();
  mocks.sendMail.mockResolvedValue({ messageId: 'smtp-message-id' });
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
});

describe('sendMail', () => {
  it('sends through Resend when a key is configured', async () => {
    mocks.env.RESEND_API_KEY = 're_123';
    mocks.env.SMTP_EMAIL = 'team@shipin.app';
    mocks.send.mockResolvedValue({ data: { id: 'resend-id' }, error: null });

    const { sendMail } = await loadMailer();

    await expect(sendMail(message)).resolves.toEqual({
      id: 'resend-id',
      provider: 'resend',
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"ShipIN" <team@shipin.app>',
        to: 'customer@example.com',
      })
    );
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it('honours a custom from address', async () => {
    mocks.env.RESEND_API_KEY = 're_123';
    mocks.env.SMTP_EMAIL = 'team@shipin.app';
    mocks.send.mockResolvedValue({ data: { id: 'id-1' }, error: null });

    const { sendMail } = await loadMailer();
    await sendMail({ ...message, from: 'Support <support@shipin.app>' });

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Support <support@shipin.app>' })
    );
  });

  it('falls back to SMTP when Resend returns an error', async () => {
    mocks.env.RESEND_API_KEY = 're_123';
    mocks.env.SMTP_EMAIL = 'team@shipin.app';
    mocks.env.SMTP_PASSWORD = 'app-password';
    mocks.send.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });

    const { sendMail } = await loadMailer();

    await expect(sendMail(message)).resolves.toEqual({
      id: 'smtp-message-id',
      provider: 'smtp',
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      'Resend failed, falling back to SMTP',
      expect.objectContaining({ error: expect.stringContaining('domain not verified') })
    );
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'gmail',
        auth: { user: 'team@shipin.app', pass: 'app-password' },
      })
    );
  });

  it('falls back to SMTP when Resend throws', async () => {
    mocks.env.RESEND_API_KEY = 're_123';
    mocks.env.SMTP_EMAIL = 'team@shipin.app';
    mocks.env.SMTP_PASSWORD = 'app-password';
    mocks.send.mockRejectedValue(new Error('network down'));

    const { sendMail } = await loadMailer();

    await expect(sendMail(message)).resolves.toEqual({
      id: 'smtp-message-id',
      provider: 'smtp',
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      'Resend failed, falling back to SMTP',
      { error: 'network down' }
    );
  });

  it('rejects when no sender address is configured', async () => {
    const { sendMail } = await loadMailer();

    await expect(sendMail(message)).rejects.toThrow('SMTP_EMAIL is required');
  });

  it('rejects when only build-time placeholder credentials exist', async () => {
    mocks.env.RESEND_API_KEY = 'dummy_for_build';
    mocks.env.SMTP_EMAIL = 'team@shipin.app';
    mocks.env.SMTP_PASSWORD = 'dummy_for_build';

    const { sendMail } = await loadMailer();

    await expect(sendMail(message)).rejects.toThrow(
      'Email sending not configured (RESEND_API_KEY or SMTP_EMAIL+PASSWORD required)'
    );
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it('uses SMTP directly when no Resend key exists', async () => {
    mocks.env.SMTP_EMAIL = 'team@shipin.app';
    mocks.env.SMTP_PASSWORD = 'app-password';

    const { sendMail } = await loadMailer();

    await expect(sendMail(message)).resolves.toEqual({
      id: 'smtp-message-id',
      provider: 'smtp',
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"ShipIN" <team@shipin.app>',
        subject: 'Quote ready',
      })
    );
  });
});
