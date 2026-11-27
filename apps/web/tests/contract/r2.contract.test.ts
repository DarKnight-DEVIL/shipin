// @vitest-environment node

/**
 * R2 contract suite — real bucket, real SigV4 presigning, no mocks.
 *
 * `src/lib/r2.test.ts` mocks `S3Client` outright, so it proves what our code
 * does with a client-shaped object. It cannot prove that the configuration we
 * hand the SDK — endpoint, region, credentials — produces URLs the store
 * actually accepts. That is the question this suite answers, and it is the one
 * that breaks on an SDK upgrade or an account-endpoint change:
 *
 *   - `PutObject` + `GetObject` round-trip through `getR2Client()`, which pins
 *     endpoint/region/credentials in `@/lib/r2` (an upload route that cannot
 *     store a photo is invisible to the unit suite).
 *   - a presigned GET returns the bytes that were stored, which pins the
 *     presigning path `/api/r2/view` depends on end to end.
 *   - an expired presigned GET is refused rather than served. The TTL is the
 *     only thing keeping an inspection photo private, so "the URL still works
 *     after it should have died" is a security regression, not a slow page.
 *
 * Run it with `npm run test:contract`. Every case skips without
 * `R2_CONTRACT_ACCOUNT_ID`, `R2_CONTRACT_ACCESS_KEY_ID`,
 * `R2_CONTRACT_SECRET_ACCESS_KEY` and `R2_CONTRACT_BUCKET`; nothing here reads
 * or writes an object it did not create, and the object is deleted afterwards.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getR2BucketName, getR2Client } from "@/lib/r2";

const ACCOUNT_ID = process.env.R2_CONTRACT_ACCOUNT_ID ?? "";
const ACCESS_KEY_ID = process.env.R2_CONTRACT_ACCESS_KEY_ID ?? "";
const SECRET_ACCESS_KEY = process.env.R2_CONTRACT_SECRET_ACCESS_KEY ?? "";
const BUCKET = process.env.R2_CONTRACT_BUCKET ?? "";

const configured = [ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET].every(
  (value) => value.length > 0
);

const KEY = `contract/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
const PAYLOAD = `shipin-r2-contract-${Date.now()}`;

describe.skipIf(!configured)("R2 presigning contract", () => {
  beforeAll(() => {
    // The suite drives the real `@/lib/r2`, which reads the app's own
    // variables. Forcing them here — including the endpoint, since a stray
    // R2_ENDPOINT or R2_REGION in the caller's environment would otherwise
    // redirect the run at another store — is what makes this a contract test
    // of the code we ship rather than of the caller's shell.
    process.env.R2_ACCOUNT_ID = ACCOUNT_ID;
    process.env.R2_ACCESS_KEY_ID = ACCESS_KEY_ID;
    process.env.R2_SECRET_ACCESS_KEY = SECRET_ACCESS_KEY;
    process.env.R2_BUCKET_NAME = BUCKET;
    process.env.R2_REGION = "auto";
    process.env.R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  });

  afterAll(async () => {
    // Best-effort cleanup: a leaked test object costs storage, not correctness.
    try {
      await getR2Client().send(
        new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: KEY })
      );
    } catch {
      // Nothing to do — the run already reported what it found.
    }
  });

  it("stores an object the same client can read back", async () => {
    const client = getR2Client();
    const bucket = getR2BucketName();

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: KEY,
        Body: PAYLOAD,
        ContentType: "text/plain",
      })
    );

    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: KEY })
    );

    const body = await stored.Body?.transformToString();

    expect(stored.ContentType).toBe("text/plain");
    expect(body).toBe(PAYLOAD);
  });

  it("presigns a GET that returns what was stored", async () => {
    const url = await getSignedUrl(
      getR2Client(),
      new GetObjectCommand({ Bucket: getR2BucketName(), Key: KEY }),
      { expiresIn: 60 }
    );

    // A presigned URL is the only way a browser reaches a private bucket, so
    // the assertion has to be a real fetch, not a header inspection.
    const response = await fetch(url);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(PAYLOAD);
  });

  it("refuses a presigned GET after it expires instead of serving it", async () => {
    const url = await getSignedUrl(
      getR2Client(),
      new GetObjectCommand({ Bucket: getR2BucketName(), Key: KEY }),
      { expiresIn: 1 }
    );

    // SigV4 timestamps have one-second resolution; wait past the boundary.
    await new Promise((resolve) => setTimeout(resolve, 2_500));

    const response = await fetch(url);

    // The property is "not served", not a particular code: S3 answers 403 with
    // "Request has expired" and a compatible store may pick 400 for the same
    // signature. A 2xx here means the object outlived the lifetime the policy
    // promised, which is the regression.
    expect([400, 403]).toContain(response.status);
    await expect(response.text()).resolves.not.toContain(PAYLOAD);
  });
});

if (!configured) {
  // Same reasoning as the PayPal suite: silence on a scheduled run reads as
  // success, and a green contract run that verified nothing is the failure mode
  // these suites exist to prevent.
  console.warn(
    "[r2 contract] R2_CONTRACT_ACCOUNT_ID / R2_CONTRACT_ACCESS_KEY_ID / R2_CONTRACT_SECRET_ACCESS_KEY / R2_CONTRACT_BUCKET are not set; the presigning contract suite was skipped."
  );
}
