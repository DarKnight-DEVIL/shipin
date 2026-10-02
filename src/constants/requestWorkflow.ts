import {
  REQUEST_STATUS,
  type RequestStatus,
} from "@/lib/requestStatus";

export const REQUEST_WORKFLOW: RequestStatus[] = [
  REQUEST_STATUS.submitted,
  REQUEST_STATUS.review,
  REQUEST_STATUS.awaiting_payment,
  REQUEST_STATUS.paid,
  REQUEST_STATUS.purchased,
  REQUEST_STATUS.warehouse_received,
  REQUEST_STATUS.ready_for_international_shipping,
  REQUEST_STATUS.packed,
  REQUEST_STATUS.shipped,
  REQUEST_STATUS.out_for_delivery,
  REQUEST_STATUS.delivered,
];

export const REQUEST_WORKFLOW_LABELS: Record<
  RequestStatus,
  string
> = {
  [REQUEST_STATUS.submitted]:
    "Submitted",

  [REQUEST_STATUS.review]:
    "Quote Ready",

  [REQUEST_STATUS.awaiting_payment]:
    "Awaiting Payment",

  [REQUEST_STATUS.paid]:
    "Paid",

  [REQUEST_STATUS.refund_offered]:
    "Refund Offered",

  /*
   * Refund is an alternate workflow path,
   * not a shipment stage.
   */
  [REQUEST_STATUS.refund_requested]:
    "Refund Requested",

  [REQUEST_STATUS.purchased]:
    "Purchased",

  [REQUEST_STATUS.warehouse_received]:
    "Warehouse Received",

  [REQUEST_STATUS.ready_for_international_shipping]:
    "Ready For International Shipment",

  [REQUEST_STATUS.packed]:
    "Packed",

  [REQUEST_STATUS.shipped]:
    "Shipped",

  [REQUEST_STATUS.out_for_delivery]:
    "Out For Delivery",

  [REQUEST_STATUS.delivered]:
    "Delivered",

  [REQUEST_STATUS.refunded]:
    "Refunded",

  [REQUEST_STATUS.rejected]:
    "Rejected",
};