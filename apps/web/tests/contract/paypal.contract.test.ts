// @vitest-environment node

/**
 * PayPal sandbox contract tests — the code paths the mocked suites cannot see.
 *
 * Every unit test around PayPal injects a transport, which proves our parsing
 * and our guards but not one thing about the other end: that PayPal still
 * accepts the request bodies we build, still answers with the fields we read,
 * and still returns the errors we map. A sandbox release that renamed
 * `purchase_units[0].payments.captures[0].amount.value`, or a path that moved,
 * would leave every mock green.
 *
 * What this suite can and cannot prove:
 *
 *   - it CAN prove auth, order creation, order read-back and the shape of both
 *     error paths. Creating an order moves no money; capturing an order nobody
 *     approved returns ORDER_NOT_APPROVED; refunding an unknown capture returns
 *     INVALID_RESOURCE_ID. None of those can charge anyone.
 *   - it CANNOT prove a successful capture or refund end to end: both need a
 *     payer to approve in a browser, which is what the staging refund smoke
 *     (`playwright-test/tests/admin-refund.spec.ts`) exists for.
 *
 * It runs only with dedicated sandbox credentials
 * (`PAYPAL_CONTRACT_CLIENT_ID` / `PAYPAL_CONTRACT_CLIENT_SECRET`) and always
 * forces the sandbox host, so a production credential in the environment can
 * never be exercised by it. `npm run test:contract` runs this file and nothing
 * else; the default suite does not include `tests/contract`.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  getPayPalAccessToken,
  getPayPalBaseUrl,
  refundPayPalOrder,
  verifyPayPalOrder,
} from "@/lib/paypal";
import { createPayPalOrder } from "@/lib/paypal/createPayPalOrder";
import { capturePayPalPayment } from "@/lib/paypal/capturePayPalPayment";

const CLIENT_ID = process.env.PAYPAL_CONTRACT_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.PAYPAL_CONTRACT_CLIENT_SECRET ?? "";
const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

const configured = CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0;

interface PayPalOrderResponse {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    amount?: { currency_code?: string; value?: string };
    reference_id?: string;
    custom_id?: string;
  }>;
}

/** An order id that cannot exist, for the refund error path. */
const UNKNOWN_CAPTURE_ID = "CONTRACTTEST0000000000000000";

describe.skipIf(!configured)("PayPal sandbox contract", () => {
  let orderId = "";
  const requestId = `contract-${Date.now()}`;
  const paypalAmount = 10;

  beforeAll(() => {
    // The suite drives the real `@/lib/paypal`, which reads the app's own
    // variables. Forcing the sandbox host here means a stray PAYPAL_ENV=live or
    // PAYPAL_API_URL in the caller's environment cannot redirect it.
    process.env.PAYPAL_CLIENT_ID = CLIENT_ID;
    process.env.PAYPAL_CLIENT_SECRET = CLIENT_SECRET;
    process.env.PAYPAL_ENV = "sandbox";
    process.env.PAYPAL_API_URL = SANDBOX_BASE_URL;
  });

  it("still issues an OAuth token for the sandbox application", async () => {
    const token = await getPayPalAccessToken();

    expect(getPayPalBaseUrl()).toBe(SANDBOX_BASE_URL);
    expect(typeof token).toBe("string");
    // A token is a JWT-ish opaque string; an empty or short value means PayPal
    // answered 200 with a body we no longer parse (`access_token`).
    expect(token.length).toBeGreaterThan(20);
  });

  it("accepts the order body we send and answers with an order id", async () => {
    const result = await createPayPalOrder({
      requestId,
      description: "ShipIN contract test",
      paymentType: "main",
      paypalAmount,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    orderId = result.orderId;
    // `createPayPalOrder` treats a missing id as a failure, so this only fires
    // if PayPal answered with something shaped differently but truthy.
    expect(orderId).toMatch(/^[A-Z0-9]{10,}$/);
  });

  it("echoes the purchase unit we created", async () => {
    expect(orderId).not.toBe("");

    const order = (await verifyPayPalOrder(orderId)) as PayPalOrderResponse;
    const unit = order.purchase_units?.[0];

    expect(order.id).toBe(orderId);
    expect(order.status).toBe("CREATED");
    // `toMatchObject`, not `toEqual`: this suite exists to catch PayPal
    // renaming or dropping the fields we read, and `toEqual` would also fail on
    // a field PayPal *adds* — an additive release that breaks nothing would
    // turn the contract run red. The two fields below are still exact.
    expect(unit?.amount).toMatchObject({
      currency_code: "USD",
      value: paypalAmount.toFixed(2),
    });
    // These two fields are how a support agent ties a PayPal order back to a
    // request; if PayPal stopped echoing them the fallback would be the stored
    // `paypalPaymentOrders` document alone.
    expect(unit?.reference_id).toBe(requestId);
    expect(unit?.custom_id).toContain(requestId);
  });

  it("refuses to capture an unapproved order as a typed failure, not a crash", async () => {
    expect(orderId).not.toBe("");

    const result = await capturePayPalPayment({
      orderID: orderId,
      requestId,
      expectedPayPalAmount: paypalAmount,
    });

    // No payer approved this order, so the capture cannot succeed — the point
    // is that PayPal still answers on the path we call and our code turns that
    // into `{ ok: false }` rather than throwing or reading a 200.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThan(500);
  });

  it("still answers the refund endpoint, and it is mapped to PAYPAL_REFUND_ERROR", async () => {
    await expect(
      refundPayPalOrder(UNKNOWN_CAPTURE_ID, 1, "USD")
    ).rejects.toMatchObject({ code: "PAYPAL_REFUND_ERROR", status: 502 });
  });
});

if (!configured) {
  // A skipped file is printed, but say why once and in one place: a green
  // contract run with no credentials has proved nothing.
  console.warn(
    "[paypal contract] PAYPAL_CONTRACT_CLIENT_ID / PAYPAL_CONTRACT_CLIENT_SECRET are not set; the sandbox contract suite was skipped."
  );
}
