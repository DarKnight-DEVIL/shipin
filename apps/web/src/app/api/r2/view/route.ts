import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";

import { GetObjectCommand } from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getR2Client, getR2BucketName } from "@/lib/r2";

import { requireAuthAccount } from "@/lib/auth";

import { authorizeInspectionAccess, parseInspectionKey } from "@/lib/r2Access";
import { purposeForKey, r2UrlTtlSeconds } from "@/lib/r2UrlPolicy";
import { readAndValidateBody, r2ViewBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export const POST = withErrorHandler(async (request: NextRequest) => {
  /*
   * The shared gate, not a hand-rolled token check: App Check (when
   * enforced), a verified email and an account that has not been disabled,
   * suspended, banned or deleted. A bare verifyIdToken kept serving a banned
   * customer's inspection photos for up to an hour, because the token outlives
   * the account state that the users/{uid} document carries.
   */
  const auth = await requireAuthAccount(request);
  if (auth instanceof NextResponse) {
    // Auth denials carry no body worth caching either.
    auth.headers.set("Cache-Control", "no-store");
    return auth;
  }

  const uid = auth.token.uid;

  const parsed = await readAndValidateBody(request, r2ViewBodySchema);

  if (!parsed.success) {
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

  const { key } = parsed.data;

  /*
   * The object key decides what this is. Only `inspection/` is served today: nothing
   * writes `labels/` yet, and there is no authorizer for it, so accepting the prefix
   * would let any signed-in user read any key under it. `purposeForKey` already knows
   * the label purpose, so enabling it is wiring an authorizer here and nothing else.
   */
  if (purposeForKey(key) !== "inspection") {
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
   * Temporary private URL. The lifetime comes from `r2UrlPolicy`, which is per
   * purpose and tunable: a warehouse review takes longer than the 15 minutes this
   * used to hard-code, and it is a different exposure from a shipping label.
   */
  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn: r2UrlTtlSeconds("inspection"),
  });

  return NextResponse.json(
    {
      success: true,
      url,
    },
    { status: 200, headers: NO_STORE }
  );
});
