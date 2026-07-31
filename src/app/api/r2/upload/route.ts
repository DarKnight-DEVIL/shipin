import { NextResponse } from "next/server";

import {
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  r2,
  R2_BUCKET_NAME,
} from "@/lib/r2";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const MAX_FILE_SIZE =
  10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

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

    const formData =
      await request.formData();

    const file =
      formData.get("file");

    const requestId =
      formData.get("requestId");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No image file provided.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof requestId !== "string" ||
      !requestId.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Request ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !ALLOWED_TYPES.includes(
        file.type
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only JPG, PNG and WebP images are allowed.",
        },
        {
          status: 400,
        }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Image must be 10 MB or smaller.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Remove characters that could create
     * undesirable object paths.
     */
    const safeRequestId =
      requestId.replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      );

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type ===
          "image/webp"
        ? "webp"
        : "jpg";

    const objectKey =
      `inspection/${safeRequestId}/${crypto.randomUUID()}.${extension}`;

    const arrayBuffer =
      await file.arrayBuffer();

    const body =
      Buffer.from(arrayBuffer);

    await r2.send(
      new PutObjectCommand({
        Bucket:
          R2_BUCKET_NAME,

        Key:
          objectKey,

        Body:
          body,

        ContentType:
          file.type,

        /*
         * These files contain warehouse
         * inspection information, so we
         * intentionally do NOT make them
         * publicly accessible.
         */
        Metadata: {
          requestid:
            safeRequestId,
        },
      })
    );

    return NextResponse.json({
      success: true,

      /*
       * Store the object key in Firestore,
       * NOT R2 credentials or a public URL.
       */
      key: objectKey,
    });
  } catch (error) {
    console.error(
      "R2 upload error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to upload image.",
      },
      {
        status: 500,
      }
    );
  }
}