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

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${serverEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
      secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
    },
  });

  return cachedClient;
}