import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import {
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import {
  getR2Client,
  getR2BucketName,
} from "@/lib/r2";

import {
  adminAuth,
} from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authorization =
    request.headers.get(
      "authorization"
    );

  if (
    !authorization?.startsWith(
      "Bearer "
    )
  ) {
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

  const idToken =
    authorization.slice(7);

  try {
    await adminAuth.verifyIdToken(
      idToken
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid authentication token.",
        code: "INVALID_AUTHENTICATION",
      },
      {
        status: 401,
        headers: NO_STORE,
      }
    );
  }

  const body =
    await request.json() as { key?: unknown };

  const key = body?.key;

  if (
    typeof key !== "string" ||
    !key.trim()
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "R2 object key is required.",
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
  if (
    !key.startsWith(
      "inspection/"
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid inspection photo path.",
        code: "INVALID_REQUEST_BODY",
      },
      {
        status: 400,
        headers: NO_STORE,
      }
    );
  }

  const command =
    new GetObjectCommand({
      Bucket:
        getR2BucketName(),

      Key:
        key,
    });

  /*
   * Temporary private URL.
   *
   * 15 minutes is enough for viewing
   * the warehouse page without making
   * the R2 object permanently public.
   */
  const url =
    await getSignedUrl(
      getR2Client(),
      command,
      {
        expiresIn:
          15 * 60,
      }
    );

  return NextResponse.json(
    {
      success: true,
      url,
    },
    { status: 200, headers: NO_STORE }
  );
});