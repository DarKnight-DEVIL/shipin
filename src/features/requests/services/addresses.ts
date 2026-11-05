import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Address } from '@/types/address';
import { toShipINError } from '@/utils/errors';

export async function addAddress(address: Omit<Address, 'id'>, userId: string): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'addresses'), {
      ...address,
      userId,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getAddresses(userId: string): Promise<Address[]> {
  try {
    const q = query(collection(db, 'addresses'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Address, 'id'>),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}