import { customerApi } from "@/lib/customerApiClient";

export interface CreateOrderResponse {
  id: string;
}

export interface CaptureOrderResponse {
  id: string;
  status: string;
  purchase_units: Array<{
    quantity?: string;
    amount?: { value: string; currency_code: string };
  }>;
}

class PaymentService {
  async createPayPalOrder(
    requestId: string,
    amount: number,
    paymentType: "main" | "additional_item" = "main",
    additionalItemRequestId?: string
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid PayPal payment amount.");
    }

    let data: { orderId?: string };

    try {
      data = await customerApi<{ orderId?: string }>(
        "/api/paypal/create-order",
        {
          method: "POST",
          body: {
            requestId,
            amount,
            paymentType,
            additionalItemRequestId,
          },
        }
      );
    } catch (error) {
      console.error("PayPal create order error:", error);

      throw new Error("Unable to create PayPal order.");
    }

    if (!data?.orderId) {
      throw new Error("PayPal order ID was not returned.");
    }

    return {
      id: data.orderId,
    };
  }

  async capturePayPalOrder(
    requestId: string,
    orderID: string,
    amount: number,
    paymentType: "main" | "additional_item" = "main",
    additionalItemRequestId?: string
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid PayPal payment amount.");
    }

    try {
      return await customerApi<CaptureOrderResponse>(
        "/api/paypal/capture-order",
        {
          method: "POST",
          body: {
            requestId,
            orderID,
            amount,
            paymentType,
            additionalItemRequestId,
          },
        }
      );
    } catch (error) {
      console.error("PayPal capture error:", error);

      throw new Error(
        error instanceof Error && error.message
          ? error.message
          : "Unable to capture PayPal payment."
      );
    }
  }
}

export const paymentService = new PaymentService();
