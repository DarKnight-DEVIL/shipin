import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  sendWhatsAppTemplate: vi.fn(),
  validateBody: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: mocks.sendWhatsAppTemplate }));
vi.mock('@/lib/validation', () => ({
  whatsappTestBodySchema: {},
  validateBody: mocks.validateBody,
}));

import { POST } from './route';

const request = (body: unknown = { phone: '919876543210' }) =>
  new NextRequest('http://localhost/api/whatsapp/test', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: 'admin-1', role: 'admin' } });
  mocks.sendWhatsAppTemplate.mockReset().mockResolvedValue(undefined);
  mocks.validateBody.mockReset().mockReturnValue({
    success: true,
    data: { phone: '919876543210' },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/whatsapp/test', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'ADMIN_ACCESS_REQUIRED' });
  });

  it('rejects an invalid phone number', async () => {
    mocks.validateBody.mockReturnValue({
      success: false,
      errors: [{ message: 'Phone number must be 10-15 digits.' }],
    });

    const response = await POST(request({ phone: '12' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_REQUEST_BODY' });
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it('sends the hello_world template', async () => {
    const response = await POST(request());

    expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: '919876543210',
      templateName: 'hello_world',
      languageCode: 'en_US',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('does not leak provider errors', async () => {
    mocks.sendWhatsAppTemplate.mockRejectedValue(new Error('meta token expired'));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      error: 'Unable to send WhatsApp message.',
      code: 'EXTERNAL_SERVICE_ERROR',
    });
    expect(JSON.stringify(body)).not.toContain('meta token expired');
    expect(console.error).toHaveBeenCalledWith('WhatsApp test failed:', 'meta token expired');
  });
});
