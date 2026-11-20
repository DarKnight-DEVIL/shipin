import { DeleteObjectsCommand } from "@aws-sdk/client-s3";

import { getR2BucketName, getR2Client } from "./r2";

/**
 * Batch deletion for R2 objects.
 *
 * Used by the retention purge to drop inspection photos once their published
 * lifetime has passed. `DeleteObjects` accepts at most 1000 keys per call, so
 * larger batches are chunked; S3-compatible stores report per-key failures in
 * `Errors` instead of throwing, so a partial failure is counted rather than
 * silently treated as success (the row is only cleared when nothing failed).
 */

const MAX_KEYS_PER_CALL = 1000;

export interface R2DeleteOutcome {
  deleted: number;
  failed: number;
}

export async function deleteR2Objects(
  keys: readonly string[]
): Promise<R2DeleteOutcome> {
  const unique = Array.from(
    new Set(keys.filter((key) => typeof key === "string" && key.trim() !== ""))
  );

  let deleted = 0;
  let failed = 0;

  for (let index = 0; index < unique.length; index += MAX_KEYS_PER_CALL) {
    const chunk = unique.slice(index, index + MAX_KEYS_PER_CALL);

    const response = await getR2Client().send(
      new DeleteObjectsCommand({
        Bucket: getR2BucketName(),
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          // Only report failures; successes are counted from the chunk length.
          Quiet: true,
        },
      })
    );

    const errors = response.Errors?.length ?? 0;
    failed += errors;
    deleted += chunk.length - errors;
  }

  return { deleted, failed };
}
