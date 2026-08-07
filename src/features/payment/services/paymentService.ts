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
    paymentType: "main" | "additional_item" = "main",
    additionalItemRequestId?: string
  ) {
    const response = await fetch("/api/paypal/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId,
        paymentType,
        additionalItemRequestId,
      }),
    });

    if (!response.ok) {
      console.error(await response.text());
      throw new Error("Unable to create PayPal order.");
    }

    const data = await response.json();
    return {
      id: data.orderId,
    };
  }

  async capturePayPalOrder(
    requestId: string,
    orderID: string,
    paymentType: "main" | "additional_item" = "main",
    additionalItemRequestId?: string
  ) {
    const response = await fetch("/api/paypal/capture-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId,
        orderID,
        paymentType,
        additionalItemRequestId,
      }),
    });

    if (!response.ok) {
      console.error(await response.json());
      throw new Error("Unable to capture PayPal payment.");
    }

    return await response.json();
  }
}

export const paymentService = new PaymentService();