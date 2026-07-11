export const REQUEST_STATUS = {
  SUBMITTED: "submitted",

  PURCHASE_INVOICE_SENT: "purchase_invoice_sent",
  PURCHASE_INVOICE_PAID: "purchase_invoice_paid",

  ITEMS_ORDERED: "items_ordered",

  WAREHOUSE_RECEIVED: "warehouse_received",
  WAREHOUSE_INSPECTED: "warehouse_inspected",

  SHIPPING_INVOICE_SENT: "shipping_invoice_sent",
  SHIPPING_INVOICE_PAID: "shipping_invoice_paid",

  SHIPPED: "shipped",

  DELIVERED: "delivered",

  CANCELLED: "cancelled",

  REFUNDED: "refunded",
} as const;

export type RequestStatus =
  (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];