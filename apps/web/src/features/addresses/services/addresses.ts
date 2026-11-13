import {
  collection,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';

import { db } from "@/lib/firebaseDb";
import { customerApi } from '@/lib/customerApiClient';
import type { Address } from '@/types/address';
import { toShipINError } from '@/utils/errors';

export async function getAddresses(
  userId: string,
): Promise<Address[]> {
  try {
    const q = query(
      collection(db, 'users', userId, 'addresses'),
      orderBy('createdAt', 'asc'),
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Address, 'id'>),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function addAddress(
  userId: string,
  address: Omit<
    Address,
    'id' | 'createdAt' | 'updatedAt'
  >,
): Promise<string> {
  try {
    void userId;

    const result = await customerApi<{ addressId: string }>('/api/addresses', {
      method: 'POST',
      body: address,
    });

    return result.addressId;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function updateAddress(
  userId: string,
  addressId: string,
  address: Partial<Address>,
): Promise<void> {
  try {
    void userId;

    await customerApi<{ success: boolean }>(`/api/addresses/${addressId}`, {
      method: 'PATCH',
      body: address,
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function deleteAddress(
  userId: string,
  addressId: string,
): Promise<void> {
  try {
    void userId;

    await customerApi<{ success: boolean }>(`/api/addresses/${addressId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function setDefaultAddress(
  userId: string,
  addressId: string,
): Promise<void> {
  try {
    void userId;

    await customerApi<{ success: boolean }>(`/api/addresses/${addressId}/default`, {
      method: 'POST',
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getDefaultAddress(
  userId: string,
): Promise<Address | null> {
  try {
    const addresses = await getAddresses(userId);

    return addresses.find((a) => a.isDefault) ?? null;
  } catch (error) {
    throw toShipINError(error);
  }
}

/**
 * Convenience alias kept for call sites that referenced the previous barrel module.
 * New code should call the address functions directly.
 */
export type AddressService = typeof getAddresses;
