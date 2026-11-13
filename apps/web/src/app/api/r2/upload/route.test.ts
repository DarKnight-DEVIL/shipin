import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  send: vi.fn(),
  getR2Client: vi.fn(),
  getR2BucketName: vi.fn(),
  command: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken },
  adminDb: {},
}));
vi.mock('@/lib/r2', () => ({
  getR2Client: mocks.getR2Client,
  getR2BucketName: mocks.getR2BucketName,
}));
vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      mocks.command(input);
      this.input = input;
    }
  },
}));

import { POST } from './route';

function uploadRequest(options: {
  token?: string;
  file?: File | null;
  requestId?: string | null;
} = {}) {
  const form = new FormData();

  if (options.file !== null) {
    form.append(
      'file',
      options.file ?? new File([new Uint8Array([1, 2, 3])], 'box.jpg', { type: 'image/jpeg' })
    );
  }
  if (options.requestId !== null) {
    form.append('requestId', options.requestId ?? 'req-1');
  }

  return new Request('http://localhost/api/r2/upload', {
    method: 'POST',
    headers: options.token === undefined ? {} : { authorization: `Bearer ${options.token}` },
    body: form,
  });
}

beforeEach(() => {
  mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.send.mockReset().mockResolvedValue({});
  mocks.getR2Client.mockReset().mockReturnValue({ send: mocks.send });
  mocks.getR2BucketName.mockReset().mockReturnValue('shipin-bucket');
  mocks.command.mockReset();
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/r2/upload', () => {
  it('requires a bearer token', async () => {
    const response = await POST(uploadRequest());

    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('expired'));

    const response = await POST(uploadRequest({ token: 'bad' }));

    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('requires a file', async () => {
    const response = await POST(uploadRequest({ token: 'good', file: null }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'No image file provided.' });
  });

  it('requires a request id', async () => {
    const response = await POST(uploadRequest({ token: 'good', requestId: null }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Request ID is required.' });
  });

  it('rejects unsupported file types', async () => {
    const file = new File(['pdf'], 'label.pdf', { type: 'application/pdf' });

    const response = await POST(uploadRequest({ token: 'good', file }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Only JPG, PNG and WebP images are allowed.',
    });
  });

  it('rejects files larger than 10 MB', async () => {
    /* FormData copies the file, so a size override has to skip it entirely. */
    const oversized = new File([new Uint8Array([1])], 'big.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
    const request = {
      headers: new Headers({ authorization: 'Bearer good' }),
      formData: async () => ({ get: (key: string) => (key === 'file' ? oversized : 'req-1') }),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Image must be 10 MB or smaller.',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('stores %s under the inspection directory', async (type, extension) => {
    const file = new File([new Uint8Array([1])], `photo.${extension}`, { type });

    const response = await POST(uploadRequest({ token: 'good', file, requestId: 'req/1!' }));
    const body = await response.json();

    expect(body.key).toBe(`inspection/req1/uuid-1.${extension}`);
    expect(mocks.command).toHaveBeenCalledWith({
      Bucket: 'shipin-bucket',
      Key: `inspection/req1/uuid-1.${extension}`,
      Body: expect.any(Buffer),
      ContentType: type,
      Metadata: { requestid: 'req1' },
    });
    expect(mocks.send).toHaveBeenCalled();
    expect(body.success).toBe(true);
  });

  it('reports an upload failure without leaking details', async () => {
    mocks.send.mockRejectedValue(new Error('r2 down'));

    const response = await POST(uploadRequest({ token: 'good' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: 'Unable to upload image.' });
    expect(console.error).toHaveBeenCalledWith('R2 upload error:', expect.any(Error));
  });
});
