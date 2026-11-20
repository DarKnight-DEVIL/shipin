import crypto from "crypto";

/**
 * Shared authentication for cron-triggered endpoints.
 *
 * The caller proves it knows `CRON_SECRET` by signing a millisecond timestamp
 * plus the request body with HMAC-SHA256, and sends the timestamp in
 * `x-cron-timestamp`. The timestamp bounds replay: a captured request stops
 * working after the window. The secret itself never travels, so a leaked log or
 * proxy trace does not hand over the ability to run the job.
 *
 * Extracted from the quote-expiry sweep when the retention purge needed the same
 * check — two copies of a signature comparison is how one of them ends up
 * subtly weaker than the other.
 */

/** Requests older than this are refused as replays. */
export const CRON_REPLAY_WINDOW_MS = 5 * 60 * 1000;

/** Tolerance for a caller whose clock runs slightly ahead of ours. */
export const CRON_CLOCK_SKEW_MS = 60 * 1000;

export async function verifyCronRequest(
  request: Request,
  secret: string | undefined
): Promise<boolean> {
  if (!secret) return false;

  const timestampHeader = request.headers.get("x-cron-timestamp");
  const signatureHeader = request.headers.get("x-cron-signature");
  if (!timestampHeader || !signatureHeader) return false;

  const requestTime = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(requestTime)) return false;

  const now = Date.now();
  if (
    now - requestTime > CRON_REPLAY_WINDOW_MS ||
    requestTime > now + CRON_CLOCK_SKEW_MS
  ) {
    return false;
  }

  // The body is read once, here. Handlers must not read it again.
  const body = await request.text();
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestampHeader}|${body}`)
    .digest("hex");

  const provided = Buffer.from(signatureHeader, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return (
    provided.length === expectedBuffer.length &&
    crypto.timingSafeEqual(provided, expectedBuffer)
  );
}
