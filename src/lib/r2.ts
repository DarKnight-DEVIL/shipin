import { S3Client } from "@aws-sdk/client-s3";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Cloudflare R2 environment variable missing: ${name}`
    );
  }
  return value;
}

export function getR2BucketName(): string {
  return requireEnv("R2_BUCKET_NAME");
}

// Keep old name working for existing imports
export const R2_BUCKET_NAME =
  process.env.R2_BUCKET_NAME ?? "";

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }

  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedClient;
}

/** @deprecated Prefer getR2Client() — kept for existing imports */
export const r2 = new Proxy({} as S3Client, {
  get(_target, prop, receiver) {
    const client = getR2Client();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});