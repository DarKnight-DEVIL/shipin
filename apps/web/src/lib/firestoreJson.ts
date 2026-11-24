/**
 * Firestore documents over JSON.
 *
 * A Firestore `Timestamp` is not a JSON value. `JSON.stringify` picks up its own
 * enumerable fields and emits `{ _seconds, _nanoseconds }`, which no consumer
 * expects, and the next `.toDate()` / `.toMillis()` call throws at runtime. A
 * route that returns documents from the Admin SDK therefore has to serialize
 * timestamps explicitly, and the reader has to put them back
 * (`restoreSerializedTimestamps` in
 * `src/features/admin/services/requestQueueClient.ts`).
 *
 * The wire shape is `{ seconds, nanoseconds }` — the same shape
 * `src/features/requests/services/quoteExpiry.ts` already parses, so a client
 * that tolerates one tolerates both.
 */

/** A Timestamp as it travels over JSON. */
export interface SerializedTimestamp {
  seconds: number;
  nanoseconds: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Duck-typed rather than `instanceof Timestamp` so this module stays free of
 * the client SDK and can run in a route handler.
 */
function isTimestamp(value: object): boolean {
  const candidate = value as { toDate?: unknown; seconds?: unknown };

  return (
    typeof candidate.toDate === "function" && isFiniteNumber(candidate.seconds)
  );
}

/**
 * Recursively replace every Firestore Timestamp with `{ seconds, nanoseconds }`.
 *
 * Everything else is copied unchanged, including plain objects that happen to
 * have a `seconds` field: only something with the Timestamp API is rewritten.
 */
export function serializeFirestoreJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(serializeFirestoreJson);
  if (typeof value !== "object" || value === null) return value;

  if (isTimestamp(value)) {
    const timestamp = value as { seconds: number; nanoseconds?: unknown };

    return {
      seconds: timestamp.seconds,
      nanoseconds: isFiniteNumber(timestamp.nanoseconds)
        ? timestamp.nanoseconds
        : 0,
    } satisfies SerializedTimestamp;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = serializeFirestoreJson(entry);
  }

  return result;
}
