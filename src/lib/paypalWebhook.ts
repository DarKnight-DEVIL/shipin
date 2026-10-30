/**
 * PayPal webhook signature verification.
 *
 * Verifies that incoming webhook requests are genuinely from PayPal
 * by validating the PAYPAL-WEBHOOK-SIGNATURE header.
 *
 * Required headers:
 * - PAYPAL-TRANSMISSION-ID
 * - PAYPAL-TRANSMISSION-TIME
 * - PAYPAL-WEBHOOK-SIGNATURE
 * - PAYPAL-CERT-URL
 *
 * The webhook body must be the raw request body (not parsed JSON).
 */
import crypto from "crypto";

/**
 * Verify a PayPal webhook signature.
 *
 * Returns true if the signature is valid, false otherwise.
 * The `webhookId` is the PayPal webhook ID from the developer dashboard.
 *
 * Note: In production, cache the certificate to avoid fetching on every request.
 */
export async function verifyPayPalWebhook(
  headers: Record<string, string | undefined>,
  rawBody: string,
  webhookId: string
): Promise<boolean> {
  const transmissionId = headers["paypal-transmission-id"];
  const transmissionTime = headers["paypal-transmission-time"];
  const webhookSignature = headers["paypal-webhook-signature"];
  const certUrl = headers["paypal-cert-url"];

  if (!transmissionId || !transmissionTime || !webhookSignature || !certUrl) {
    console.warn("PayPal webhook missing required headers");
    return false;
  }

  // Construct the message that PayPal signed
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crypto
    .createHash("sha256")
    .update(rawBody)
    .digest("hex")}`;

  try {
    // Fetch the certificate
    const certResponse = await fetch(certUrl);
    if (!certResponse.ok) {
      console.error("Failed to fetch PayPal certificate:", certResponse.status);
      return false;
    }
    const certPem = await certResponse.text();

    // Verify the signature
    const verifier = crypto.createVerify("sha256");
    verifier.update(message);
    verifier.end();

    const signatureBuffer = Buffer.from(webhookSignature, "base64");
    const isValid = verifier.verify(certPem, signatureBuffer);

    if (!isValid) {
      console.warn("PayPal webhook signature verification failed");
    }

    return isValid;
  } catch (error) {
    console.error("PayPal webhook verification error:", error);
    return false;
  }
}

/**
 * Express/Next.js middleware helper for PayPal webhook verification.
 * Use as: `await requirePayPalWebhook(request, webhookId)`
 */
export async function requirePayPalWebhook(
  request: Request,
  webhookId: string
): Promise<{ valid: boolean; error?: string }> {
  const rawBody = await request.text();
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const valid = await verifyPayPalWebhook(headers, rawBody, webhookId);

  if (!valid) {
    return { valid: false, error: "Invalid PayPal webhook signature" };
  }

  return { valid: true };
}