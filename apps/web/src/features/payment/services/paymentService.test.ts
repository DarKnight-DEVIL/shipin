import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const customerApiMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/customerApiClient", () => ({
  customerApi: customerApiMock,
}));

import { paymentService } from "./paymentService";

beforeEach(() => {
  customerApiMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createPayPalOrder", () => {
  it("returns the order id from the API", async () => {
    customerApiMock.mockResolvedValue({ orderId: "ORDER-1" });

    await expect(
      paymentService.createPayPalOrder("req-1", 100)
    ).resolves.toEqual({
      id: "ORDER-1",
    });

    expect(customerApiMock).toHaveBeenCalledWith("/api/paypal/create-order", {
      method: "POST",
      body: {
        requestId: "req-1",
        amount: 100,
        paymentType: "main",
        additionalItemRequestId: undefined,
      },
    });
  });

  it("forwards the additional-item context", async () => {
    customerApiMock.mockResolvedValue({ orderId: "ORDER-1" });

    await paymentService.createPayPalOrder(
      "req-1",
      10,
      "additional_item",
      "add-1"
    );

    expect(customerApiMock.mock.calls[0][1].body).toEqual({
      requestId: "req-1",
      amount: 10,
      paymentType: "additional_item",
      additionalItemRequestId: "add-1",
    });
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the amount %d without calling the API",
    async (amount) => {
      await expect(
        paymentService.createPayPalOrder("req-1", amount)
      ).rejects.toThrow("Invalid PayPal payment amount.");
      expect(customerApiMock).not.toHaveBeenCalled();
    }
  );

  it("reports a failed order creation", async () => {
    customerApiMock.mockRejectedValue(new Error("paypal down"));

    await expect(
      paymentService.createPayPalOrder("req-1", 100)
    ).rejects.toThrow("Unable to create PayPal order.");
    expect(console.error).toHaveBeenCalledWith(
      "PayPal create order error:",
      expect.any(Error)
    );
  });

  it("rejects a response without an order id", async () => {
    customerApiMock.mockResolvedValue({});

    await expect(
      paymentService.createPayPalOrder("req-1", 100)
    ).rejects.toThrow("PayPal order ID was not returned.");
  });
});

describe("capturePayPalOrder", () => {
  it("returns the capture payload", async () => {
    const payload = { id: "CAP-1", status: "COMPLETED", purchase_units: [] };
    customerApiMock.mockResolvedValue(payload);

    await expect(
      paymentService.capturePayPalOrder("req-1", "ORDER-1", 100)
    ).resolves.toEqual(payload);
    expect(customerApiMock).toHaveBeenCalledWith("/api/paypal/capture-order", {
      method: "POST",
      body: {
        requestId: "req-1",
        orderID: "ORDER-1",
        amount: 100,
        paymentType: "main",
        additionalItemRequestId: undefined,
      },
    });
  });

  it.each([0, -1, Number.NaN])("rejects the amount %d", async (amount) => {
    await expect(
      paymentService.capturePayPalOrder("req-1", "ORDER-1", amount)
    ).rejects.toThrow("Invalid PayPal payment amount.");
    expect(customerApiMock).not.toHaveBeenCalled();
  });

  it("surfaces the API error message", async () => {
    customerApiMock.mockRejectedValue(new Error("INSTRUMENT_DECLINED"));

    await expect(
      paymentService.capturePayPalOrder("req-1", "ORDER-1", 100)
    ).rejects.toThrow("INSTRUMENT_DECLINED");
  });

  it("falls back to a generic message for a non-error rejection", async () => {
    customerApiMock.mockRejectedValue("nope");

    await expect(
      paymentService.capturePayPalOrder("req-1", "ORDER-1", 100)
    ).rejects.toThrow("Unable to capture PayPal payment.");
  });
});
