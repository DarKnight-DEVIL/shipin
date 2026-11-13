import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  customerApi: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  query: vi.fn((ref: unknown) => ({ ref })),
  orderBy: vi.fn(() => ({})),
  getDocs: mocks.getDocs,
}));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));
vi.mock('@/lib/customerApiClient', () => ({ customerApi: mocks.customerApi }));

import {
  addAddress,
  deleteAddress,
  getAddresses,
  getDefaultAddress,
  setDefaultAddress,
  updateAddress,
} from './addresses';

const docs = (...addresses: Record<string, unknown>[]) => ({
  docs: addresses.map((address, index) => ({
    id: `addr-${index + 1}`,
    data: () => address,
  })),
});

beforeEach(() => {
  mocks.getDocs.mockReset();
  mocks.customerApi.mockReset().mockResolvedValue({ success: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getAddresses', () => {
  it('maps stored addresses with their ids', async () => {
    mocks.getDocs.mockResolvedValue(
      docs({ line1: '1 Main St', isDefault: false }, { line1: '2 Side St', isDefault: true })
    );

    await expect(getAddresses('user-1')).resolves.toEqual([
      { id: 'addr-1', line1: '1 Main St', isDefault: false },
      { id: 'addr-2', line1: '2 Side St', isDefault: true },
    ]);
  });

  it('returns an empty list when the user has none', async () => {
    mocks.getDocs.mockResolvedValue(docs());

    await expect(getAddresses('user-1')).resolves.toEqual([]);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getAddresses('user-1')).rejects.toBeInstanceOf(Error);
  });
});

describe('getDefaultAddress', () => {
  it('returns the address flagged as default', async () => {
    mocks.getDocs.mockResolvedValue(
      docs({ line1: '1 Main St' }, { line1: '2 Side St', isDefault: true })
    );

    await expect(getDefaultAddress('user-1')).resolves.toMatchObject({
      id: 'addr-2',
      line1: '2 Side St',
    });
  });

  it('returns null when no address is default', async () => {
    mocks.getDocs.mockResolvedValue(docs({ line1: '1 Main St' }));

    await expect(getDefaultAddress('user-1')).resolves.toBeNull();
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getDefaultAddress('user-1')).rejects.toBeInstanceOf(Error);
  });
});

describe('address mutations', () => {
  it('creates an address and returns its id', async () => {
    mocks.customerApi.mockResolvedValue({ addressId: 'addr-9' });

    await expect(
      addAddress('user-1', { line1: '1 Main St', isDefault: true } as never)
    ).resolves.toBe('addr-9');
    expect(mocks.customerApi).toHaveBeenCalledWith('/api/addresses', {
      method: 'POST',
      body: { line1: '1 Main St', isDefault: true },
    });
  });

  it('updates an address', async () => {
    await updateAddress('user-1', 'addr-9', { country: 'GB' });

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/addresses/addr-9', {
      method: 'PATCH',
      body: { country: 'GB' },
    });
  });

  it('deletes an address', async () => {
    await deleteAddress('user-1', 'addr-9');

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/addresses/addr-9', {
      method: 'DELETE',
    });
  });

  it('marks an address as default', async () => {
    await setDefaultAddress('user-1', 'addr-9');

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/addresses/addr-9/default', {
      method: 'POST',
    });
  });

  it('wraps mutation failures', async () => {
    mocks.customerApi.mockRejectedValue(new Error('offline'));

    await expect(addAddress('user-1', {} as never)).rejects.toBeInstanceOf(Error);
    await expect(updateAddress('user-1', 'addr-9', {})).rejects.toBeInstanceOf(Error);
    await expect(deleteAddress('user-1', 'addr-9')).rejects.toBeInstanceOf(Error);
    await expect(setDefaultAddress('user-1', 'addr-9')).rejects.toBeInstanceOf(Error);
  });
});
