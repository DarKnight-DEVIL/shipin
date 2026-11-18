import { describe, expect, it } from 'vitest';

import { getClientIp } from './clientIp';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/test', { headers });
}

describe('getClientIp', () => {
  it('uses the platform header, which a client cannot forge', () => {
    expect(
      getClientIp(
        requestWith({
          'x-vercel-forwarded-for': '203.0.113.7',
          'x-forwarded-for': '198.51.100.1',
        })
      )
    ).toBe('203.0.113.7');
  });

  it('ignores cf-connecting-ip, because the platform does not set it', () => {
    // A browser can send any header. Trusting this one let an attacker rotate
    // it per request and mint a fresh rate-limit bucket every time.
    expect(
      getClientIp(
        requestWith({
          'cf-connecting-ip': '9.9.9.9',
          'cf-ray': '8a1b2c3d4e5f-SIN',
        })
      )
    ).toBeNull();
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIp(requestWith({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('takes the last hop of x-forwarded-for, never the client-supplied first one', () => {
    expect(
      getClientIp(requestWith({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))
    ).toBe('10.0.0.2');
  });

  it('skips empty entries in the forwarded chain', () => {
    expect(getClientIp(requestWith({ 'x-forwarded-for': '1.2.3.4, , 10.0.0.2' }))).toBe('10.0.0.2');
  });

  it('ignores an empty platform header and keeps looking', () => {
    expect(
      getClientIp(
        requestWith({ 'x-vercel-forwarded-for': '   ', 'x-real-ip': '198.51.100.7' })
      )
    ).toBe('198.51.100.7');
  });

  it('trims whitespace around the address', () => {
    expect(getClientIp(requestWith({ 'x-vercel-forwarded-for': ' 203.0.113.7 ' }))).toBe(
      '203.0.113.7'
    );
  });

  it('returns null when no address header is present', () => {
    expect(getClientIp(requestWith({}))).toBeNull();
  });
});
