import crypto from "crypto";
import { NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { getR2Client, getR2BucketName } from "@/lib/r2";

import { adminAuth } from "@/lib/firebaseAdmin";

import { authorizeInspectionUpload } from "@/lib/r2Access";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
/** Room for the multipart envelope around one 10 MB file. */
const MAX_REQUEST_BYTES = MAX_FILE_SIZE + 1024 * 1024;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * What a request id may contain.
 *
 * Deliberately the shape we are willing to put in an object key, checked once and used
 * unchanged. A Firestore id that legitimately carries something else (a dot, a space) is
 * refused rather than rewritten - "upload failed, bad id" is debuggable, a file appearing
 * in a folder nobody asked for is not.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const POST = withErrorHandler(async (request: Request) => {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
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
        },
        {
          status: 401,
        }
      );
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image must be 10 MB or smaller." },
        { status: 413 }
      );
    }

    const formData = await request.formData();

    const file = formData.get("file");

    const requestId = formData.get("requestId");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "No image file provided.",
        },
        {
          status: 400,
        }
      );
    }

    if (typeof requestId !== "string" || !requestId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Request ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Only JPG, PNG and WebP images are allowed.",
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
          error: "Image must be 10 MB or smaller.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Validate the id, never rewrite it.
     *
     * The object key and the ownership check must use the same string: if the id is
     * sanitised, a caller who sends one id can be authorised against another, and two
     * different inputs can collapse onto one folder. Refusing an id we would have to
     * change keeps "authorised" and "written" the same string by construction, and turns
     * a path-traversal attempt into a visible 400 instead of a silently different folder.
     */
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      return NextResponse.json(
        {
          success: false,
          error: "That request id is not valid.",
          code: "INVALID_REQUEST_ID",
        },
        { status: 400 }
      );
    }

    /*
     * Ownership: without this, any signed-in account could write objects into
     * another customer's request folder — warehouse evidence is shown to that
     * customer and to admins.
     */
    const denial = await authorizeInspectionUpload(uid);

    if (denial) {
      return NextResponse.json(
        { success: false, error: denial.error, code: denial.code },
        { status: denial.status }
      );
    }

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";

    const objectKey = `inspection/${requestId}/${crypto.randomUUID()}.${extension}`;

    const arrayBuffer = await file.arrayBuffer();

    const body = Buffer.from(arrayBuffer);

    // `file.type` is caller-supplied. Sniff the signature so a renamed file
    // cannot be stored and later served as an image.
    const looksLikeImage =
      (file.type === "image/jpeg" &&
        body.length >= 3 &&
        body[0] === 0xff &&
        body[1] === 0xd8 &&
        body[2] === 0xff) ||
      (file.type === "image/png" &&
        body.length >= 8 &&
        body
          .subarray(0, 8)
          .equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
          )) ||
      (file.type === "image/webp" &&
        body.length >= 12 &&
        body.subarray(0, 4).toString("ascii") === "RIFF" &&
        body.subarray(8, 12).toString("ascii") === "WEBP");

    if (!looksLikeImage) {
      return NextResponse.json(
        {
          success: false,
          error: "The file contents do not match an allowed image type.",
        },
        { status: 400 }
      );
    }

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),

        Key: objectKey,

        Body: body,

        ContentType: file.type,

        /*
         * These files contain warehouse
         * inspection information, so we
         * intentionally do NOT make them
         * publicly accessible.
         */
        Metadata: {
          requestid: requestId,
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
    console.error("R2 upload error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to upload image.",
      },
      {
        status: 500,
      }
    );
  }
});
