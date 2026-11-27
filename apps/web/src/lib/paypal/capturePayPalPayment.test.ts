import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getPayPalAccessToken: vi.fn(),
}));

/*
 * getPayPalBaseUrl is mirrored here rather than imported: with `isolate: false`
 * the real @/lib/paypal module can arrive cached from another file's registry,
 * bound to that file's env mock (the pitfall noted below). The real function
 * keeps its own dedicated tests in paypal.test.ts; this mirror only has to
 * resolve the two env vars the same way.
 */
vi.mock("@/lib/paypal", () => ({
  getPayPalAccessToken: mocks.getPayPalAccessToken,
  getPayPalBaseUrl: () =>
    process.env.PAYPAL_API_URL ||
    (process.env.PAYPAL_ENV === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com"),
}));

import { capturePayPalPayment } from "./capturePayPalPayment";

/**
 * The transport is injected rather than mocked at `@/lib/http`: the suite runs
 * with `isolate: false`, so another file can have already cached the real
 * module and a `vi.mock` here would be silently ignored.
 */
const input = {
  orderID: "order-1",
  requestId: "req-1",
  expectedPayPalAmount: 84.7,
  transport: mocks.fetchWithTimeout,
};

const completed = (capture: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => ({
    status: "COMPLETED",
    purchase_units: [{ payments: { captures: [capture] } }],
  }),
});

const validCapture = {
  id: "capture-1",
  amount: { value: "84.70", currency_code: "USD" },
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset();
  mocks.getPayPalAccessToken.mockReset().mockResolvedValue("access-token");
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("capturePayPalPayment", () => {
  it("returns the capture PayPal confirmed", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(completed(validCapture));

    await expect(capturePayPalPayment(input)).resolves.toEqual({
      ok: true,
      captureId: "capture-1",
      capturedAmount: 84.7,
      capturedCurrency: "USD",
    });

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders/order-1/capture",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      })
    );
  });

  it("uses PAYPAL_API_URL when it is configured", async () => {
    vi.stubEnv("PAYPAL_API_URL", "https://paypal.test");
    mocks.fetchWithTimeout.mockResolvedValue(completed(validCapture));

    await capturePayPalPayment(input);

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      "https://paypal.test/v2/checkout/orders/order-1/capture",
      expect.anything()
    );
  });

  it("uses the live host when PAYPAL_ENV is live and PAYPAL_API_URL is unset", async () => {
    // The regression: the capture host used to default to the sandbox host
    // regardless of PAYPAL_ENV, so a live deployment that set the env but
    // forgot the URL spent a live token against the sandbox API.
    vi.stubEnv("PAYPAL_ENV", "live");
    mocks.fetchWithTimeout.mockResolvedValue(completed(validCapture));

    await capturePayPalPayment(input);

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      "https://api-m.paypal.com/v2/checkout/orders/order-1/capture",
      expect.anything()
    );
  });

  it("passes PayPal's own failure status through", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ name: "UNPROCESSABLE_ENTITY" }),
    });

    await expect(capturePayPalPayment(input)).resolves.toEqual({
      ok: false,
      status: 422,
      error: "Unable to process payment. Please try again.",
    });
    expect(consoleError).toHaveBeenCalledWith("PayPal capture error:", {
      name: "UNPROCESSABLE_ENTITY",
    });
  });

  it("refuses a capture PayPal did not mark completed", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "PENDING" }),
    });

    await expect(capturePayPalPayment(input)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "PayPal payment was not completed.",
    });
  });

  it("refuses a response with no capture", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "COMPLETED", purchase_units: [{}] }),
    });

    await expect(capturePayPalPayment(input)).resolves.toMatchObject({
      ok: false,
      error: "PayPal capture details were not found.",
    });
  });

  it("refuses a capture without an id", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(
      completed({ amount: { value: "84.70", currency_code: "USD" } })
    );

    await expect(capturePayPalPayment(input)).resolves.toMatchObject({
      error: "PayPal capture ID was not found.",
    });
  });

  it.each([
    ["a missing amount", { id: "capture-1", amount: { currency_code: "USD" } }],
    [
      "a zero amount",
      { id: "capture-1", amount: { value: "0.00", currency_code: "USD" } },
    ],
    [
      "an unparseable amount",
      { id: "capture-1", amount: { value: "eighty", currency_code: "USD" } },
    ],
  ])("refuses %s", async (_label, capture) => {
    mocks.fetchWithTimeout.mockResolvedValue(completed(capture));

    await expect(capturePayPalPayment(input)).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "Invalid PayPal capture amount.",
    });
  });

  it("refuses a currency other than USD", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(
      completed({
        id: "capture-1",
        amount: { value: "84.70", currency_code: "EUR" },
      })
    );

    await expect(capturePayPalPayment(input)).resolves.toMatchObject({
      error: "Unexpected PayPal payment currency.",
    });
  });

  it("refuses a capture for a different amount and logs both figures", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(
      completed({
        id: "capture-1",
        amount: { value: "1.00", currency_code: "USD" },
      })
    );

    await expect(capturePayPalPayment(input)).resolves.toMatchObject({
      ok: false,
      status: 400,
      error:
        "Captured payment amount does not match the expected PayPal payment.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "PayPal capture amount mismatch:",
      {
        expectedPayPalAmount: 84.7,
        capturedAmount: 1,
        orderID: "order-1",
        requestId: "req-1",
      }
    );
  });
});
