/**
 * Cursor pagination for the admin list routes.
 *
 * Every admin list used to read its whole collection in one `get()` and return
 * it as one JSON body: an operator refreshing the console paid one read per
 * document, per refresh, and the response grew with the order book until it
 * was multi-megabyte and timed out. These helpers give the routes one cursor
 * format and one page shape so the screens can fetch in bounded chunks.
 *
 * The cursor is the `createdAt` of the last document on the page, base64url
 * encoded. Each route builds its own query chain — `orderBy("createdAt", …)`
 * stays in the route's source on purpose: `check:firestore-indexes` reads that
 * chain, so a route that adds an equality filter next to the order (the
 * requests route's `?status=`) is forced to declare the composite index in
 * `firestore.indexes.json` instead of failing at first production query.
 *
 * Caveat, accepted deliberately: documents with an identical `createdAt` can
 * straddle a page boundary, because the cursor has no document-id tiebreak
 * (Firestore rejects cursor values beyond the orderBy fields). In practice
 * `createdAt` is a per-user-action `serverTimestamp()`, so ties do not occur
 * in normal operation; a bulk import could skip a document at one boundary.
 */

import type {
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

export const ADMIN_PAGE_DEFAULT = 100;
export const ADMIN_PAGE_MAX = 200;

/** Thrown for a `?limit`/`?cursor` the route must answer with a 400. */
export class InvalidAdminPageParamError extends Error {
  readonly code = "INVALID_PAGE_PARAM";
}

export interface AdminPageParams {
  limit: number;
  /** `createdAt` of the last document of the previous page, in ms. */
  cursorMs: number | null;
}

export interface AdminPage<T> {
  items: T[];
  /** Pass back as `?cursor`; null once the last page has been served. */
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Reads `?limit` and `?cursor`. An absent `limit` is the default page size; a
 * present one is clamped to `ADMIN_PAGE_MAX` so one caller cannot ask for the
 * whole collection back. A malformed cursor is a client bug and is reported,
 * not silently treated as page one (that would loop forever).
 */
export function parseAdminPageParams(url: URL): AdminPageParams {
  const rawLimit = url.searchParams.get("limit");

  let limit = ADMIN_PAGE_DEFAULT;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new InvalidAdminPageParamError();
    }
    limit = Math.min(parsed, ADMIN_PAGE_MAX);
  }

  const rawCursor = url.searchParams.get("cursor");
  let cursorMs: number | null = null;

  if (rawCursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(rawCursor, "base64url").toString("utf8")
      ) as { t?: unknown };

      if (
        typeof decoded.t !== "number" ||
        !Number.isFinite(decoded.t) ||
        decoded.t < 0
      ) {
        throw new Error("not a timestamp");
      }

      cursorMs = decoded.t;
    } catch {
      throw new InvalidAdminPageParamError();
    }
  }

  return { limit, cursorMs };
}

/** Encodes the cursor a client passes back as `?cursor`. */
export function encodeCursor(createdAtMs: number): string {
  return Buffer.from(JSON.stringify({ t: createdAtMs })).toString("base64url");
}

function cursorMillisOf(doc: QueryDocumentSnapshot<DocumentData>): number {
  const createdAt = doc.get("createdAt") as
    { toMillis?: () => number } | undefined;

  return typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : 0;
}

/**
 * Assembles the response page. `hasMore` is the cheap heuristic — the page
 * came back exactly full, so assume there is one more. A collection whose size
 * is an exact multiple of the page size costs one extra, empty round trip;
 * that is the trade against a `count()` on every page.
 */
export function toAdminPage<T>(
  docs: QueryDocumentSnapshot<DocumentData>[],
  limit: number,
  map: (doc: QueryDocumentSnapshot<DocumentData>) => T
): AdminPage<T> {
  const hasMore = docs.length === limit;

  return {
    items: docs.map(map),
    hasMore,
    nextCursor:
      hasMore && docs.length > 0
        ? encodeCursor(cursorMillisOf(docs[docs.length - 1]))
        : null,
  };
}
