import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  sendMail: vi.fn(),
  generateEmail: vi.fn(),
  record: vi.fn(),
  addRateLimitHeaders: vi.fn(),
  validateBody: vi.fn(),
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));
vi.mock('@/lib/mailer', () => ({ sendMail: mocks.sendMail }));
vi.mock('@/lib/emailTemplates', () => ({ generateEmail: mocks.generateEmail }));
vi.mock('@/lib/rateLimiter', () => ({
  strictRateLimiter: { record: mocks.record },
  addRateLimitHeaders: mocks.addRateLimitHeaders,
}));
vi.mock('@/lib/validation', () => ({
  sendEmailBodySchema: {},
  validateBody: mocks.validateBody,
}));

import { POST } from './route';

const body = { type: 'shipped', email: 'ada@example.com', trackingNumber: 'ABC' };

const request = (payload: unknown = body) =>
  new NextRequest('http://localhost/api/send-email', {
    method: 'POST',
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.getAdminAuthError.mockReset().mockReturnValue({ error: 'Unauthorized', status: 401 });
  mocks.sendMail.mockReset().mockResolvedValue(undefined);
  mocks.generateEmail.mockReset().mockReturnValue({ subject: 'Subject', html: '<p>Hi</p>' });
  mocks.record.mockReset().mockResolvedValue({ ok: true });
  mocks.addRateLimitHeaders.mockReset();
  mocks.validateBody.mockReset().mockReturnValue({ success: true, data: body });
});

describe('POST /api/send-email', () => {
  it('rejects non-admins with an authentication code', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('no token'));

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('reports an authorization failure distinctly', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('not an admin'));
    mocks.getAdminAuthError.mockReturnValue({ error: 'Forbidden', status: 403 });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });

  it('rate limits the caller', async () => {
    mocks.record.mockResolvedValue({ ok: false });

    const response = await POST(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: 'RATE_LIMIT_ERROR' });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('rejects an unreadable body', async () => {
    const response = await POST(request('{broken'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('rejects a body that fails validation', async () => {
    mocks.validateBody.mockReturnValue({ success: false, errors: [{ message: 'bad' }] });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('sends a server-defined template', async () => {
    const response = await POST(request());

    expect(mocks.generateEmail).toHaveBeenCalledWith('shipped', {
      requestId: '',
      amount: undefined,
      trackingNumber: 'ABC',
      supportMessage: undefined,
    });
    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: 'ada@example.com',
      subject: 'Subject',
      html: '<p>Hi</p>',
    });
    expect(mocks.addRateLimitHeaders).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('maps the legacy shipment type', async () => {
    mocks.validateBody.mockReturnValue({
      success: true,
      data: { ...body, type: 'shipment' },
    });

    await POST(request());

    expect(mocks.generateEmail.mock.calls[0][0]).toBe('shipped');
  });
});
