import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { PAYPAL_API_URL: "https://paypal.test" } as {
    PAYPAL_API_URL?: string;
    PAYPAL_ENV?: string;
  },
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
    mocks.env.PAYPAL_API_URL ??
    (mocks.env.PAYPAL_ENV === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com"),
}));
vi.mock("@/config/env", () => ({ serverEnv: mocks.env }));

/**
 * Imported per test, after `vi.resetModules()`: with `isolate: false` one module
 * registry is shared by every file in a worker, so this module (and its env /
 * transport imports) can arrive already evaluated against another file's mocks.
 * That is how this file failed a nightly shuffle — the sandbox-host fallback saw
 * an env it never set. Same pattern as `src/lib/appCheck.test.ts`.
 */
let createPayPalOrder: typeof import("./createPayPalOrder").createPayPalOrder;

/**
 * The transport is injected rather than mocked at `@/lib/http`: the suite runs
 * with `isolate: false`, so another file can have already cached the real
 * module and a `vi.mock` here would be silently ignored.
 */
const input = {
  requestId: "req-1",
  description: "ShipIN Request REQ-100",
  paymentType: "main" as const,
  paypalAmount: 104.7,
  transport: mocks.fetchWithTimeout,
};

const sentBody = () => JSON.parse(mocks.fetchWithTimeout.mock.calls[0][1].body);

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  ({ createPayPalOrder } = await import("./createPayPalOrder"));

  mocks.env.PAYPAL_API_URL = "https://paypal.test";
  mocks.env.PAYPAL_ENV = undefined;
  mocks.fetchWithTimeout.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: "order-1" }),
  });
  mocks.getPayPalAccessToken.mockReset().mockResolvedValue("access-token");
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createPayPalOrder", () => {
  it("creates the order and returns its id", async () => {
    await expect(createPayPalOrder(input)).resolves.toEqual({
      ok: true,
      orderId: "order-1",
    });

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      "https://paypal.test/v2/checkout/orders",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      })
    );
  });

  it("sends the quoted amount in cents-precise form", async () => {
    await createPayPalOrder(input);

    expect(sentBody()).toMatchObject({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "req-1",
          description: "ShipIN Request REQ-100",
          amount: { currency_code: "USD", value: "104.70" },
        },
      ],
    });
    expect(JSON.parse(sentBody().purchase_units[0].custom_id)).toEqual({
      requestId: "req-1",
      paymentType: "main",
      additionalItemRequestId: null,
    });
  });

  it("references the add-on in the purchase unit", async () => {
    await createPayPalOrder({
      ...input,
      paymentType: "additional_item",
      additionalItemRequestId: "item-1",
      paypalAmount: 20,
    });

    expect(sentBody().purchase_units[0].reference_id).toBe("req-1:item-1");
    expect(JSON.parse(sentBody().purchase_units[0].custom_id)).toEqual({
      requestId: "req-1",
      paymentType: "additional_item",
      additionalItemRequestId: "item-1",
    });
  });

  it("passes PayPal's failure status through", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        name: "INTERNAL_SERVER_ERROR",
        message: "An internal server error occurred.",
      }),
    });

    await expect(createPayPalOrder(input)).resolves.toEqual({
      ok: false,
      status: 500,
      error: "Unable to process payment. Please try again.",
      // PayPal's own code, so the caller can tell a declined card from an
      // outage without parsing the human message.
      errorCode: "INTERNAL_SERVER_ERROR",
    });
    expect(consoleError).toHaveBeenCalledWith("PayPal create order error:", {
      code: "INTERNAL_SERVER_ERROR",
      message: "An internal server error occurred.",
      status: 500,
    });
  });

  it("sanitises an unknown error body instead of passing it through", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ something: "unexpected" }),
    });

    await expect(createPayPalOrder(input)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Unable to process payment. Please try again.",
      errorCode: "UNKNOWN",
    });
  });

  it("refuses a response with no order id", async () => {
    mocks.fetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(createPayPalOrder(input)).resolves.toEqual({
      ok: false,
      status: 502,
      error: "PayPal did not return an order ID.",
    });
  });

  it("falls back to the sandbox host without PAYPAL_API_URL", async () => {
    mocks.env.PAYPAL_API_URL = undefined;

    await createPayPalOrder(input);

    expect(mocks.fetchWithTimeout.mock.calls[0][0]).toBe(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders"
    );
  });

  it("uses the live host when PAYPAL_ENV is live and PAYPAL_API_URL is unset", async () => {
    // The regression: the order host used to default to the sandbox host
    // regardless of PAYPAL_ENV, so a live deployment that set the env but
    // forgot the URL spent a live token against the sandbox API.
    mocks.env.PAYPAL_API_URL = undefined;
    mocks.env.PAYPAL_ENV = "live";

    await createPayPalOrder(input);

    expect(mocks.fetchWithTimeout.mock.calls[0][0]).toBe(
      "https://api-m.paypal.com/v2/checkout/orders"
    );
  });
});
