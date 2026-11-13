import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getSignedUrl: vi.fn(),
  getR2Client: vi.fn(),
  getR2BucketName: vi.fn(),
  command: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: class {
    constructor(input: unknown) {
      mocks.command(input);
      this.input = input;
    }
    input: unknown;
  },
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.getSignedUrl }));
vi.mock('@/lib/r2', () => ({
  getR2Client: mocks.getR2Client,
  getR2BucketName: mocks.getR2BucketName,
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken },
}));

import { POST } from './route';

const request = (options: { token?: string; body?: unknown } = {}) =>
  new NextRequest('http://localhost/api/r2/view', {
    method: 'POST',
    headers: options.token === undefined ? {} : { authorization: `Bearer ${options.token}` },
    body: JSON.stringify(options.body ?? { key: 'inspection/box.jpg' }),
  });

beforeEach(() => {
  mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'user-1' });
  mocks.getSignedUrl.mockReset().mockResolvedValue('https://r2.example/signed');
  mocks.getR2Client.mockReset().mockReturnValue({ client: true });
  mocks.getR2BucketName.mockReset().mockReturnValue('shipin-bucket');
  mocks.command.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/r2/view', () => {
  it('requires a bearer token', async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('expired'));

    const response = await POST(request({ token: 'bad' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_AUTHENTICATION',
    });
  });

  it('requires an object key', async () => {
    const response = await POST(request({ token: 'good', body: {} }));

    expect(response.status).toBe(400);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects keys outside the inspection directory', async () => {
    const response = await POST(
      request({ token: 'good', body: { key: 'invoices/secret.pdf' } })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid inspection photo path.',
    });
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns a short-lived signed url', async () => {
    const response = await POST(request({ token: 'good' }));

    expect(mocks.command).toHaveBeenCalledWith({
      Bucket: 'shipin-bucket',
      Key: 'inspection/box.jpg',
    });
    expect(mocks.getSignedUrl).toHaveBeenCalledWith({ client: true }, expect.anything(), {
      expiresIn: 900,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      url: 'https://r2.example/signed',
    });
  });
});
