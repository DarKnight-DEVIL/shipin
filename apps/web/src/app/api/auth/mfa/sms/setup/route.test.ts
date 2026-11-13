import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  update: vi.fn(),
  generateSmsCode: vi.fn(),
  hashSmsCode: vi.fn(),
  sendWhatsAppTemplate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ update: mocks.update })) })) },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/lib/mfa', () => ({
  generateSmsCode: mocks.generateSmsCode,
  hashSmsCode: mocks.hashSmsCode,
}));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: mocks.sendWhatsAppTemplate }));

import { POST } from './route';

const request = (body: unknown = { phoneNumber: '+441234567890' }) =>
  new NextRequest('http://localhost/api/auth/mfa/sms/setup', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: 'admin-1', role: 'admin' } });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.generateSmsCode.mockReset().mockReturnValue('654321');
  mocks.hashSmsCode.mockReset().mockReturnValue('hashed-654321');
  mocks.sendWhatsAppTemplate.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/auth/mfa/sms/setup', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires an administrator', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'user-1', role: 'customer' },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
  });

  it.each(['', '441234567890', '+0123456', '+44 1234'])(
    'rejects the phone number %j',
    async (phoneNumber) => {
      const response = await POST(request({ phoneNumber }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_PHONE_NUMBER' });
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it('stores a hashed code with a five minute expiry and sends it', async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const response = await POST(request());

    expect(mocks.update).toHaveBeenCalledWith({
      'mfa.sms.pendingCode': 'hashed-654321',
      'mfa.sms.pendingPhoneNumber': '+441234567890',
      'mfa.sms.pendingExpires': now + 5 * 60 * 1000,
      updatedAt: '__SERVER_TS__',
    });
    expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: '+441234567890',
      templateName: 'hello_world',
      languageCode: 'en_US',
      components: [{ type: 'body', parameters: [{ type: 'text', text: '654321' }] }],
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: 'Verification code sent to +441234567890. Expires in 5 minutes.',
    });
  });

  it('keeps the pending code when the sender fails', async () => {
    mocks.sendWhatsAppTemplate.mockRejectedValue(new Error('meta down'));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'SMS send failed (WhatsApp fallback):',
      expect.any(Error)
    );
  });
});
