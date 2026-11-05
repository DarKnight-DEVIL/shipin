import { NextResponse } from "next/server";

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

export async function POST(
  request: Request
) {
  try {
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
        },
        {
          status: 401,
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
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

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
        },
        {
          status: 400,
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
        },
        {
          status: 400,
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

    return NextResponse.json({
      success: true,
      url,
    });
  } catch (error) {
    console.error(
      "R2 signed URL error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}