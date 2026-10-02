export interface CreateOrderResponse {
  id: string;
}

export interface CaptureOrderResponse {
  id: string;
  status: string;
  purchase_units: any[];
}

class PaymentService {
  async createPayPalOrder(
    requestId: string,
    amount: number,
    paymentType: "main" | "additional_item" = "main",
    additionalItemRequestId?: string
  ) {
    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Invalid PayPal payment amount."
      );
    }

    const response = await fetch(
      "/api/paypal/create-order",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          requestId,
          amount,
          paymentType,
          additionalItemRequestId,
        }),
      }
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        "PayPal create order error:",
        errorText
      );

      throw new Error(
        "Unable to create PayPal order."
      );
    }

    const data =
      await response.json();

    if (!data?.orderId) {
      throw new Error(
        "PayPal order ID was not returned."
      );
    }

    return {
      id: data.orderId,
    };
  }

  async capturePayPalOrder(
    requestId: string,
    orderID: string,
    amount: number,
    paymentType:
      | "main"
      | "additional_item" = "main",
    additionalItemRequestId?: string
  ) {
    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Invalid PayPal payment amount."
      );
    }

    const response = await fetch(
      "/api/paypal/capture-order",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          requestId,
          orderID,
          amount,
          paymentType,
          additionalItemRequestId,
        }),
      }
    );

    if (!response.ok) {
      let errorMessage =
        "Unable to capture PayPal payment.";

      try {
        const data =
          await response.json();

        console.error(
          "PayPal capture error:",
          data
        );

        if (data?.error) {
          errorMessage = data.error;
        }
      } catch {
        console.error(
          "Unable to parse PayPal capture error."
        );
      }

      throw new Error(errorMessage);
    }

    return await response.json();
  }
}

export const paymentService =
  new PaymentService();