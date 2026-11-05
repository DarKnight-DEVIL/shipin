import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { Address } from '@/types/address';
import { toShipINError, NotFoundError } from '@/utils/errors';

export async function getAddresses(
  userId: string
): Promise<Address[]> {
  try {
    const q = query(
      collection(db, 'users', userId, 'addresses'),
      orderBy('createdAt', 'asc')
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
  >
): Promise<string> {
  try {
    const docRef = await addDoc(
      collection(db, 'users', userId, 'addresses'),
      {
        ...address,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    return docRef.id;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function updateAddress(
  userId: string,
  addressId: string,
  address: Partial<Address>
): Promise<void> {
  try {
    await updateDoc(
      doc(
        db,
        'users',
        userId,
        'addresses',
        addressId
      ),
      {
        ...address,
        updatedAt: serverTimestamp(),
      }
    );
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function deleteAddress(
  userId: string,
  addressId: string
): Promise<void> {
  try {
    await deleteDoc(
      doc(
        db,
        'users',
        userId,
        'addresses',
        addressId
      )
    );
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function setDefaultAddress(
  userId: string,
  addressId: string
): Promise<void> {
  try {
    const addresses = await getAddresses(userId);

    for (const address of addresses) {
      await updateDoc(
        doc(
          db,
          'users',
          userId,
          'addresses',
          address.id
        ),
        {
          isDefault: address.id === addressId,
        }
      );
    }
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getDefaultAddress(
  userId: string
): Promise<Address | null> {
  try {
    const addresses = await getAddresses(userId);

    return (
      addresses.find(
        (a) => a.isDefault
      ) ?? null
    );
  } catch (error) {
    throw toShipINError(error);
  }
}