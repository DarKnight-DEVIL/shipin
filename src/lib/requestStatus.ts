export const REQUEST_STATUS = {
  submitted: "submitted",

  review: "review",

  awaiting_payment: "awaiting_payment",

  paid: "paid",

  purchased: "purchased",

  warehouse_received: "warehouse_received",

  ready_for_international_shipping:
    "ready_for_international_shipping",

  packed: "packed",

  shipped: "shipped",

  out_for_delivery:
    "out_for_delivery",

  delivered: "delivered",

  refunded: "refunded",
} as const;

export type RequestStatus =
  typeof REQUEST_STATUS[keyof typeof REQUEST_STATUS];