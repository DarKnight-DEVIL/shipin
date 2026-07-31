import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function regenerateQuote(
  requestId: string,
  breakdown: any
) {
  await updateDoc(
    doc(db, "requests", requestId),
    {
      quote: {
        breakdown,

        createdAt: new Date(),

        expiresAt: new Date(
          Date.now() +
            24 * 60 * 60 * 1000
        ),

        regeneratedCount: 1,

        expired: false,
      },
    }
  );
}