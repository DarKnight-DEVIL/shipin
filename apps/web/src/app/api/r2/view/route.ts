import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { GetObjectCommand } from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getR2Client, getR2BucketName } from "@/lib/r2";

import { adminAuth } from "@/lib/firebaseAdmin";

import { authorizeInspectionAccess, parseInspectionKey } from "@/lib/r2Access";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized.",
        code: "AUTHENTICATION_REQUIRED",
      },
      {
        status: 401,
        headers: NO_STORE,
      }
    );
  }

  const idToken = authorization.slice(7);

  let uid: string;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);

    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid authentication token.",
        code: "INVALID_AUTHENTICATION",
      },
      {
        status: 401,
        headers: NO_STORE,
      }
    );
  }

  const body = (await request.json()) as { key?: unknown };

  const key = body?.key;

  if (typeof key !== "string" || !key.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: "R2 object key is required.",
        code: "INVALID_REQUEST_BODY",
      },
      {
        status: 400,
        headers: NO_STORE,
      }
    );
  }

  /*
   * Inspection images should only come
   * from the inspection directory.
   */
  if (!key.startsWith("inspection/")) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid inspection photo path.",
        code: "INVALID_REQUEST_BODY",
      },
      {
        status: 400,
        headers: NO_STORE,
      }
    );
  }

  const command = new GetObjectCommand({
    Bucket: getR2BucketName(),

    Key: key,
  });

  /*
   * Ownership: the key identifies a request, and only that request's customer
   * or an admin may read its photos. Being signed in was previously enough to
   * turn any leaked key into a URL.
   */
  const keyRequestId = parseInspectionKey(key);

  if (!keyRequestId) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid inspection photo path.",
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const denial = await authorizeInspectionAccess(uid, keyRequestId);

  if (denial) {
    return NextResponse.json(
      { success: false, error: denial.error, code: denial.code },
      { status: denial.status, headers: NO_STORE }
    );
  }

  /*
   * Temporary private URL.
   *
   * 15 minutes is enough for viewing
   * the warehouse page without making
   * the R2 object permanently public.
   */
  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn: 15 * 60,
  });

  return NextResponse.json(
    {
      success: true,
      url,
    },
    { status: 200, headers: NO_STORE }
  );
});
