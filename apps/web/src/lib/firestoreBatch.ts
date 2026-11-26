import type {
  DocumentData,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";

/** Firestore's hard limit is 500 writes per batch; leave room for future edits. */
const MAX_WRITES_PER_BATCH = 450;

export type FirestoreBatchOperation =
  | { type: "delete"; ref: DocumentReference }
  | { type: "update"; ref: DocumentReference; data: DocumentData };

/**
 * Commit an arbitrary number of writes in batches that Firestore will accept.
 *
 * Erasure and account cleanup used a single batch, so an account with more than
 * 500 records failed halfway with no way to finish. Each chunk is atomic; the
 * caller gets a failure as soon as one chunk fails rather than a silent partial
 * success.
 */
export async function commitInChunks(
  db: Firestore,
  operations: FirestoreBatchOperation[]
): Promise<void> {
  for (
    let start = 0;
    start < operations.length;
    start += MAX_WRITES_PER_BATCH
  ) {
    const batch = db.batch();

    for (const operation of operations.slice(
      start,
      start + MAX_WRITES_PER_BATCH
    )) {
      if (operation.type === "delete") batch.delete(operation.ref);
      else batch.update(operation.ref, operation.data);
    }

    await batch.commit();
  }
}
