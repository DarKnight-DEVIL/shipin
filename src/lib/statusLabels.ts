import { REQUEST_STATUS } from "./requestStatus";

export const statusLabels = {
  [REQUEST_STATUS.submitted]: "Submitted",

  [REQUEST_STATUS.review]: "Quote Ready",

  [REQUEST_STATUS.awaiting_payment]: "Awaiting Payment",

  [REQUEST_STATUS.paid]: "Payment Received",

  [REQUEST_STATUS.purchased]: "Purchased",

  [REQUEST_STATUS.warehouse_received]: "Warehouse Received",

  [REQUEST_STATUS.ready_for_international_shipping]:
    "Ready For International Shipment",

  [REQUEST_STATUS.packed]: "Packed",

  [REQUEST_STATUS.shipped]: "Shipped",

  [REQUEST_STATUS.out_for_delivery]:
    "Out For Delivery",

  [REQUEST_STATUS.delivered]: "Delivered",

  [REQUEST_STATUS.refunded]: "Refunded",
} as const;