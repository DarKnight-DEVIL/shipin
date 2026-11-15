/**
 * `GET|POST|PATCH /api/compliance/breach` — DPDP breach register.
 *
 * A breach record is regulatory evidence, so the route must refuse a partial
 * record (no severity, no categories, no discovery date) instead of writing
 * something that cannot be notified to the Data Protection Board.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  recordBreach: vi.fn(),
  updateBreach: vi.fn(),
  getAllBreaches: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAdmin: mocks.admin }));
vi.mock('@/lib/compliance/breach', () => ({
  recordBreach: mocks.recordBreach,
  updateBreach: mocks.updateBreach,
  getAllBreaches: mocks.getAllBreaches,
}));

import { GET, PATCH, POST } from './route';

const request = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/compliance/breach', {
    method,
    ...(body === undefined
      ? {}
      : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

const validRecord = {
  action: 'record',
  severity: 'high',
  description: 'S3 bucket misconfiguration',
  affectedCategories: ['shipping'],
  estimatedAffectedUsers: 42,
  discoveredAt: '2026-03-01T00:00:00.000Z',
};

beforeEach(() => {
  mocks.admin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.recordBreach.mockReset().mockResolvedValue('breach-1');
  mocks.updateBreach.mockReset().mockResolvedValue(undefined);
  mocks.getAllBreaches.mockReset().mockResolvedValue([]);
});

describe('GET /api/compliance/breach', () => {
  it('rejects a non-admin caller', async () => {
    mocks.admin.mockResolvedValue(
      NextResponse.json({ error: 'nope' }, { status: 403 })
    );

    expect((await GET(request('GET'))).status).toBe(403);
  });

  it('lists the most recent breaches', async () => {
    mocks.getAllBreaches.mockResolvedValue([{ id: 'breach-1' }]);

    const body = await (await GET(request('GET'))).json();

    expect(body).toEqual({ success: true, breaches: [{ id: 'breach-1' }] });
    expect(mocks.getAllBreaches).toHaveBeenCalledWith(undefined, 100);
  });
});

describe('POST /api/compliance/breach', () => {
  it('rejects malformed JSON', async () => {
    const response = await POST(request('POST', '{oops'));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_JSON');
  });

  it.each([
    [{ ...validRecord, severity: 'catastrophic' }, 'Valid severity required'],
    [{ ...validRecord, description: '' }, 'Description required.'],
    [{ ...validRecord, affectedCategories: [] }, 'Affected categories required.'],
    [{ ...validRecord, affectedCategories: 'shipping' }, 'Affected categories required.'],
    [{ ...validRecord, estimatedAffectedUsers: -1 }, 'Estimated affected users must be a number.'],
    [{ ...validRecord, estimatedAffectedUsers: 'many' }, 'Estimated affected users must be a number.'],
    [{ ...validRecord, discoveredAt: undefined }, 'Discovered date required.'],
  ])('rejects %j', async (payload, message) => {
    const response = await POST(request('POST', payload));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(message);
    expect(mocks.recordBreach).not.toHaveBeenCalled();
  });

  it('records a breach with the optional detail fields', async () => {
    const response = await POST(
      request('POST', {
        ...validRecord,
        containedAt: '2026-03-02T00:00:00.000Z',
        rootCause: 'Public-read ACL',
        remediationSteps: ['Revoke ACL', 'Rotate keys'],
        reportedToBoard: true,
        reportedToUsers: false,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.breachId).toBe('breach-1');
    expect(body.message).toMatch(/72-hour notification/);
    expect(mocks.recordBreach).toHaveBeenCalledWith({
      severity: 'high',
      description: 'S3 bucket misconfiguration',
      affectedCategories: ['shipping'],
      estimatedAffectedUsers: 42,
      discoveredAt: new Date('2026-03-01T00:00:00.000Z'),
      containedAt: new Date('2026-03-02T00:00:00.000Z'),
      rootCause: 'Public-read ACL',
      remediationSteps: ['Revoke ACL', 'Rotate keys'],
      reportedToBoard: true,
      reportedToUsers: false,
    });
  });

  it('defaults the optional fields when they are absent or mistyped', async () => {
    await POST(
      request('POST', {
        ...validRecord,
        rootCause: 42,
        remediationSteps: 'not-an-array',
      })
    );

    expect(mocks.recordBreach).toHaveBeenCalledWith(
      expect.objectContaining({
        containedAt: undefined,
        rootCause: undefined,
        remediationSteps: undefined,
        reportedToBoard: false,
        reportedToUsers: false,
      })
    );
  });

  it('rejects an unknown action', async () => {
    const response = await POST(request('POST', { action: 'delete' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Unknown action.');
  });
});

describe('PATCH /api/compliance/breach', () => {
  it('rejects malformed JSON', async () => {
    const response = await PATCH(request('PATCH', '{oops'));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_JSON');
  });

  it('requires a breach id', async () => {
    const response = await PATCH(request('PATCH', { status: 'contained' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Breach ID required.');
  });

  it('applies only the supplied fields', async () => {
    const response = await PATCH(
      request('PATCH', {
        breachId: 'breach-1',
        status: 'contained',
        containedAt: '2026-03-02T00:00:00.000Z',
        rootCause: 'Public-read ACL',
        remediationSteps: ['Revoke ACL'],
        reportedToBoard: true,
        reportedToUsers: true,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.updateBreach).toHaveBeenCalledWith('breach-1', {
      containedAt: new Date('2026-03-02T00:00:00.000Z'),
      rootCause: 'Public-read ACL',
      remediationSteps: ['Revoke ACL'],
      reportedToBoard: true,
      reportedToUsers: true,
      status: 'contained',
    });
  });

  it('sends an empty update when no optional field is provided', async () => {
    await PATCH(request('PATCH', { breachId: 'breach-1' }));

    expect(mocks.updateBreach).toHaveBeenCalledWith('breach-1', {});
  });
});
