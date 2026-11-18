import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebaseDb";

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

      const counter = {
        value: current,
        updatedAt: serverTimestamp(),
      };

      // set+merge reads like an upsert but is an update for an existing
      // document; say which one it is.
      if (snapshot.exists()) {
        transaction.update(counterRef, counter);
      } else {
        transaction.set(counterRef, counter);
      }

      return `SHP-${new Date().getFullYear()}-${String(
        current
      ).padStart(6, "0")}`;
    }
  );
}