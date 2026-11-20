import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/config/env";

let cachedClient: S3Client | null = null;

export function getR2BucketName(): string {
  return serverEnv.R2_BUCKET_NAME;
}

export function getR2Client(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }

  // R2 accepts any region string ("auto"); another S3-compatible store needs
  // its own. R2_ENDPOINT lets a migration point at S3 or MinIO without a code
  // change, and falls back to the Cloudflare account endpoint.
  cachedClient = new S3Client({
    region: serverEnv.R2_REGION || "auto",
    endpoint:
      serverEnv.R2_ENDPOINT ||
      `https://${serverEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
      secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
    },
  });

  return cachedClient;
}
