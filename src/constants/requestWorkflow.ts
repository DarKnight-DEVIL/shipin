export const REQUEST_WORKFLOW = [
  "submitted",
  "review",
  "payment",
  "paid",
  "purchased",
  "warehouse_received",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
];
export const REQUEST_STATUS_LABELS: Record<
  string,
  string
> = {
  submitted: "Submitted",
  review: "Review",

  payment: "Quote Ready",

  paid: "Paid",

  purchased: "Purchased",

  warehouse_received:
    "Warehouse",

  packed: "Packed",

  shipped: "Shipped",

  out_for_delivery:
    "Out for Delivery",

  delivered: "Delivered",

  refunded: "Refunded",
};