import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  add: vi.fn(),
  update: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/features/notifications/services/notificationService', () => ({
  sendNotification: mocks.sendNotification,
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        get: async () => {
          const data = mocks.docs[`${name}/${id}`];
          if (!data) return { exists: false, data: () => undefined };
          return { exists: true, data: () => data };
        },
        update: mocks.update,
      }),
      add: mocks.add,
    }),
  },
}));

import { POST } from './route';

const context = (ticketId = 'ticket-1') => ({ params: Promise.resolve({ ticketId }) });

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/support/ticket-1/message', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const customer = { profile: { uid: 'user-1', role: 'customer' } };
const admin = { profile: { uid: 'admin-1', role: 'admin' } };

beforeEach(() => {
  mocks.docs = {
    'supportTickets/ticket-1': { customerId: 'user-1', requestId: 'req-1', ticketNumber: 'T-100' },
    'requests/req-1': { customerName: 'Ada', shippingAddress: { firstName: 'Grace' } },
    'users/user-1': {
      preferences: {
        notifications: {
          categories: { support: true },
          channels: { whatsapp: { consentedAt: '2026-01-01', phone: '+919876543210' } },
        },
      },
    },
  };
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue(customer);
  mocks.add.mockReset().mockResolvedValue({ id: 'msg-1' });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.sendNotification.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/support/[ticketId]/message', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request({ sender: 'customer', message: 'Hi' }), context());

    expect(response.status).toBe(401);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('requires a ticket, sender and message', async () => {
    const noSender = await POST(request({ message: 'Hi' }), context());
    const noMessage = await POST(request({ sender: 'customer', message: '   ' }), context());
    const noTicket = await POST(request({ sender: 'customer', message: 'Hi' }), context(''));

    expect([noSender.status, noMessage.status, noTicket.status]).toEqual([400, 400, 400]);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('stops a customer posting as support', async () => {
    const response = await POST(request({ sender: 'admin', message: 'Hi' }), context());

    expect(response.status).toBe(403);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('404s for an unknown ticket', async () => {
    mocks.docs = {};

    const response = await POST(request({ sender: 'customer', message: 'Hi' }), context());

    expect(response.status).toBe(404);
  });

  it("stops a customer replying to someone else's ticket", async () => {
    mocks.docs['supportTickets/ticket-1'] = { customerId: 'someone-else' };

    const response = await POST(request({ sender: 'customer', message: 'Hi' }), context());

    expect(response.status).toBe(403);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('saves a customer message and flags it for the admin', async () => {
    const response = await POST(
      request({ sender: 'customer', message: '  Where is my parcel?  ' }),
      context()
    );

    expect(mocks.add).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      sender: 'customer',
      message: 'Where is my parcel?',
      createdAt: '__SERVER_TS__',
    });
    expect(mocks.update).toHaveBeenCalledWith({
      updatedAt: '__SERVER_TS__',
      adminUnread: true,
      customerUnread: false,
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('notifies the customer on an admin reply, including WhatsApp', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(admin);

    await POST(request({ sender: 'admin', message: 'On its way' }), context());

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ adminUnread: false, customerUnread: true })
    );
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        requestId: 'req-1',
        category: 'support',
        channels: { inApp: true, email: true, whatsapp: true },
        whatsapp: expect.objectContaining({ templateName: 'shipin_support_update' }),
      })
    );
  });

  it('omits WhatsApp when the customer has not consented', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(admin);
    mocks.docs['users/user-1'] = { preferences: { notifications: {} } };

    await POST(request({ sender: 'admin', message: 'On its way' }), context());

    const payload = mocks.sendNotification.mock.calls[0][0];
    expect(payload.channels.whatsapp).toBe(false);
    expect(payload.whatsapp).toBeUndefined();
  });

  it('ignores a boolean WhatsApp preference', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(admin);
    mocks.docs['users/user-1'] = {
      preferences: { notifications: { channels: { whatsapp: true } } },
    };

    await POST(request({ sender: 'admin', message: 'Hi' }), context());

    expect(mocks.sendNotification.mock.calls[0][0].channels.whatsapp).toBe(false);
  });

  it('survives missing request and user documents', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(admin);
    mocks.docs['requests/req-1'] = undefined;
    mocks.docs['users/user-1'] = undefined;

    const response = await POST(request({ sender: 'admin', message: 'Hi' }), context());

    expect(response.status).toBe(200);
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channels: { inApp: true, email: true, whatsapp: false } })
    );
  });

  it('uses the shipping first name when there is no customer name', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(admin);
    mocks.docs['requests/req-1'] = { shippingAddress: { firstName: 'Grace' } };

    await POST(request({ sender: 'admin', message: 'Hi' }), context());

    const template = mocks.sendNotification.mock.calls[0][0].whatsapp;
    expect(template.components[0].parameters[0].text).toBe('Grace');
  });

  it('falls back to the ticket id when there is no ticket number', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(admin);
    mocks.docs['supportTickets/ticket-1'] = { customerId: 'user-1', requestId: 'req-1' };

    await POST(request({ sender: 'admin', message: 'Hi' }), context());

    const template = mocks.sendNotification.mock.calls[0][0].whatsapp;
    expect(template.components[0].parameters[1].text).toBe('ticket-1');
  });

  it('skips the notification when the ticket has no customer', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(admin);
    mocks.docs['supportTickets/ticket-1'] = {};

    const response = await POST(request({ sender: 'admin', message: 'Hi' }), context());

    expect(response.status).toBe(200);
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '', requestId: '' })
    );
  });

  it('keeps the reply saved when the notification fails', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(admin);
    mocks.sendNotification.mockRejectedValue(new Error('mail down'));

    const response = await POST(request({ sender: 'admin', message: 'Hi' }), context());

    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      'Support notification failed:',
      expect.any(Error)
    );
  });
});
