import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebase";

export async function generateTrackingId() {
  const counterRef = doc(
    collection(db, "counters"),
    "tracking"
  );

  return runTransaction(
    db,
    async (transaction) => {

      const snapshot =
        await transaction.get(counterRef);

      let current = 0;

      if (snapshot.exists()) {
        current = snapshot.data().value ?? 0;
      }

      current++;

      transaction.set(
        counterRef,
        {
          value: current,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return `SHP-${new Date().getFullYear()}-${String(
        current
      ).padStart(6, "0")}`;
    }
  );
}