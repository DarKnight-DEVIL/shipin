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
} from "firebase/firestore";

import { db } from "./firebase";
import type { Address } from "@/types/address";

export async function getAddresses(
  userId: string
): Promise<Address[]> {
  const q = query(
    collection(db, "users", userId, "addresses"),
    orderBy("createdAt", "asc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Address, "id">),
  }));
}

export async function addAddress(
  userId: string,
  address: Omit<
    Address,
    "id" | "createdAt" | "updatedAt"
  >
) {
  const docRef = await addDoc(
    collection(db, "users", userId, "addresses"),
    {
      ...address,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );

  return docRef.id;
}

export async function updateAddress(
  userId: string,
  addressId: string,
  address: Partial<Address>
) {
  await updateDoc(
    doc(
      db,
      "users",
      userId,
      "addresses",
      addressId
    ),
    {
      ...address,
      updatedAt: serverTimestamp(),
    }
  );
}

export async function deleteAddress(
  userId: string,
  addressId: string
) {
  await deleteDoc(
    doc(
      db,
      "users",
      userId,
      "addresses",
      addressId
    )
  );
}

export async function setDefaultAddress(
  userId: string,
  addressId: string
) {
  const addresses =
    await getAddresses(userId);

  for (const address of addresses) {
    await updateDoc(
      doc(
        db,
        "users",
        userId,
        "addresses",
        address.id
      ),
      {
        isDefault:
          address.id === addressId,
      }
    );
  }
}

export async function getDefaultAddress(
  userId: string
) {
  const addresses =
    await getAddresses(userId);

  return (
    addresses.find(
      (a) => a.isDefault
    ) ?? null
  );
}