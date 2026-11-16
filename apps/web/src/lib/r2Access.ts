/**
 * Ownership rules for inspection photos in R2.
 *
 * Both R2 routes only proved "you are signed in": any account could upload into
 * another customer's `inspection/<requestId>/` folder, and any signed-in user
 * could exchange an object key for a signed URL once they had it. The key is
 * derived from the request id, so the request document is the authorization
 * boundary.
 *
 * Keys are `inspection/<requestId>/<uuid>.<ext>` (see /api/r2/upload).
 */
import { adminDb } from "@/lib/firebaseAdmin";

export interface R2AccessDenial {
  status: 400 | 403 | 404;
  error: string;
  code: string;
}

/** Extract the request id from an inspection object key, or null. */
export function parseInspectionKey(key: string): string | null {
  const match = /^inspection\/([^/]+)\/[^/]+$/.exec(key);
  return match ? match[1] : null;
}

/**
 * Allow the request's owner or an admin (warehouse staff work every request).
 *
 * A request that does not exist and a request owned by somebody else return the
 * same 404: telling a caller "this exists but is not yours" turns the endpoint
 * into an oracle for guessing request ids.
 */
export async function authorizeInspectionAccess(
  uid: string,
  requestId: string
): Promise<R2AccessDenial | null> {
  if (!requestId) {
    return {
      status: 400,
      error: "Invalid inspection photo path.",
      code: "INVALID_REQUEST_BODY",
    };
  }

  const requestSnapshot = await adminDb.collection("requests").doc(requestId).get();
  const ownerId = requestSnapshot.exists
    ? String(requestSnapshot.data()?.userId ?? "")
    : "";

  if (ownerId && ownerId === uid) {
    return null;
  }

  const profileSnapshot = await adminDb.collection("users").doc(uid).get();
  const role = profileSnapshot.exists ? profileSnapshot.data()?.role : undefined;

  if (role === "admin") {
    return null;
  }

  return {
    status: 404,
    error: "Request not found.",
    code: "REQUEST_NOT_FOUND",
  };
}
