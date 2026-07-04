import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "./firebase";

export const addAddress = async (
  address: any,
  userId: string
) => {
  await addDoc(collection(db, "addresses"), {
    ...address,
    userId,
  });
};

export const getAddresses = async (
  userId: string
) => {
  const q = query(
    collection(db, "addresses"),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};