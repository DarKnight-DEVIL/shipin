export async function sendCustomerEmail(
  type:
    | "quote"
    | "payment"
    | "shipped"
    | "delivered"
    | "refunded"
    | "support",
  data: any
) {
  const routes = {
    quote: "/api/send-quote-email",
    payment: "/api/send-payment-email",
    shipped: "/api/send-shipped-email",
    delivered: "/api/send-delivered-email",
    refunded: "/api/send-refunded-email",
    support: "/api/send-support-reply-email",
  };

  const response = await fetch(routes[type], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return response.json();
}