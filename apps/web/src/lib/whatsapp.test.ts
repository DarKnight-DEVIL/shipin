/**
 * Tests for the WhatsApp Cloud API sender.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  serverEnv: {} as Record<string, string | undefined>,
  fetchWithTimeout: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  serverEnv: mocks.serverEnv,
  clientEnv: {},
  readEnv: (key: string) => mocks.serverEnv[key],
}));

vi.mock('@/lib/http', () => ({ fetchWithTimeout: mocks.fetchWithTimeout }));

vi.mock('@/lib/logger', () => ({
  childLogger: () => ({
    error: mocks.logError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { sendWhatsAppTemplate } from './whatsapp';

const baseParams = {
  to: '+91 98765 43210',
  templateName: 'quote_ready',
};

beforeEach(() => {
  for (const key of Object.keys(mocks.serverEnv)) delete mocks.serverEnv[key];
  mocks.serverEnv.WHATSAPP_ACCESS_TOKEN = 'wa-token';
  mocks.serverEnv.WHATSAPP_PHONE_NUMBER_ID = 'phone-1';
  mocks.serverEnv.WHATSAPP_API_VERSION = 'v20.0';
  mocks.fetchWithTimeout.mockReset();
  mocks.logError.mockReset();
  mocks.fetchWithTimeout.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: 'wamid.1' }] }),
  });
});

describe('sendWhatsAppTemplate', () => {
  it('posts a template message with a digits-only recipient', async () => {
    const result = await sendWhatsAppTemplate(baseParams);

    expect(result).toEqual({ messages: [{ id: 'wamid.1' }] });

    const [url, init] = mocks.fetchWithTimeout.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v20.0/phone-1/messages');
    expect(init.headers.Authorization).toBe('Bearer wa-token');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919876543210',
      type: 'template',
      template: { name: 'quote_ready', language: { code: 'en_US' } },
    });
    expect(body.template.components).toBeUndefined();
  });

  it('includes components and a custom language when supplied', async () => {
    await sendWhatsAppTemplate({
      ...baseParams,
      languageCode: 'en_GB',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }] }],
    });

    const body = JSON.parse(mocks.fetchWithTimeout.mock.calls[0][1].body);
    expect(body.template.language.code).toBe('en_GB');
    expect(body.template.components).toHaveLength(1);
  });

  it('requires an access token', async () => {
    delete mocks.serverEnv.WHATSAPP_ACCESS_TOKEN;

    await expect(sendWhatsAppTemplate(baseParams)).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
      status: 500,
    });
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('requires a phone number id', async () => {
    delete mocks.serverEnv.WHATSAPP_PHONE_NUMBER_ID;

    await expect(sendWhatsAppTemplate(baseParams)).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
    });
  });

  it('rejects a recipient with no digits', async () => {
    await expect(
      sendWhatsAppTemplate({ ...baseParams, to: 'not-a-number' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('surfaces the provider error message', async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid template' } }),
    });

    await expect(sendWhatsAppTemplate(baseParams)).rejects.toMatchObject({
      message: 'Invalid template',
      code: 'EXTERNAL_SERVICE_ERROR',
      status: 502,
    });
    expect(mocks.logError).toHaveBeenCalledWith(
      'WhatsApp API error',
      expect.objectContaining({ status: 400 })
    );
  });

  it('falls back to a generic message when the error body is empty', async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(sendWhatsAppTemplate(baseParams)).rejects.toThrow(
      'Failed to send WhatsApp message.'
    );
  });
});
