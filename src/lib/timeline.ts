import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export async function addTimelineEvent(
  requestId: string,
  title: string,
  description?: string
) {
  await addDoc(
    collection(
      db,
      "requests",
      requestId,
      "timeline"
    ),
    {
      title,
      description: description ?? "",
      createdAt: serverTimestamp(),
    }
  );
}