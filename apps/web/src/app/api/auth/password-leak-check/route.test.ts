import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

const fetchMock = vi.fn();

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/auth/password-leak-check', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/auth/password-leak-check', () => {
  it('rejects an unreadable body', async () => {
    const response = await POST(request('{nope'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_JSON' });
  });

  it.each(['', 'ABC', 'ZZZZZ', 'ABCDEF', 12345])('rejects the prefix %j', async (prefix) => {
    const response = await POST(request({ prefix }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries HIBP with the upper-cased prefix only', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => 'AAAA:1' });

    await POST(request({ prefix: '  abcde ' }));

    expect(fetchMock).toHaveBeenCalledWith('https://api.pwnedpasswords.com/range/ABCDE', {
      headers: { 'User-Agent': 'ShipIN Security Check', 'Add-Padding': 'true' },
    });
  });

  it('returns the matching suffixes without blank lines', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => 'aaaa:1\r\nbbbb:2\r\n\r\n',
    });

    const response = await POST(request({ prefix: 'ABCDE' }));

    await expect(response.json()).resolves.toEqual({
      success: true,
      suffixes: ['AAAA:1', 'BBBB:2'],
    });
  });

  it('reports an unavailable service without failing the check', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const response = await POST(request({ prefix: 'ABCDE' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      leaked: false,
      serviceUnavailable: true,
    });
  });

  it('returns 502 when the upstream call throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const response = await POST(request({ prefix: 'ABCDE' }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'EXTERNAL_SERVICE_ERROR' });
    expect(console.error).toHaveBeenCalledWith('Password leak check failed:', 'network down');
  });
});
