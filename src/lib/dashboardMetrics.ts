import type { RequestStatus } from "@/lib/requestStatus";

export type DashboardMetricId =
  | "active"
  | "submitted"
  | "quote_ready"
  | "awaiting_payment"
  | "paid"
  | "purchased"
  | "warehouse_received"
  | "ready_for_international_shipping"
  | "packed"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "refunded";

export interface DashboardMetric {
  id: DashboardMetricId;
  label: string;
  description: string;
}

export const dashboardMetrics: DashboardMetric[] = [
  {
    id: "active",
    label: "Active Requests",
    description: "All requests currently in progress.",
  },
  {
    id: "submitted",
    label: "Submitted",
    description: "Requests waiting for review.",
  },
  {
    id: "quote_ready",
    label: "Quote Ready",
    description: "Requests with a quote ready for approval.",
  },
  {
    id: "awaiting_payment",
    label: "Awaiting Payment",
    description: "Requests waiting for payment.",
  },
  {
    id: "paid",
    label: "Payment Confirmed",
    description: "Requests with confirmed payment.",
  },
  {
    id: "purchased",
    label: "Items Purchased",
    description: "Orders whose products have been purchased.",
  },
  {
    id: "warehouse_received",
    label: "At Warehouse",
    description: "Orders received at the ShipIN warehouse.",
  },
  {
    id: "ready_for_international_shipping",
    label: "Ready to Ship",
    description: "Orders ready for international shipping.",
  },
  {
    id: "packed",
    label: "Packed",
    description: "Orders packed and ready for dispatch.",
  },
  {
    id: "shipped",
    label: "Shipped",
    description: "Orders that have been dispatched.",
  },
  {
    id: "in_transit",
    label: "In Transit",
    description: "Orders currently travelling to the customer.",
  },
  {
    id: "out_for_delivery",
    label: "Out for Delivery",
    description: "Orders currently out for final delivery.",
  },
  {
    id: "delivered",
    label: "Delivered",
    description: "Successfully delivered orders.",
  },
  {
    id: "refunded",
    label: "Refunded",
    description: "Orders that have been refunded.",
  },
];

export const DEFAULT_DASHBOARD_METRICS: DashboardMetricId[] = [
  "active",
  "awaiting_payment",
  "in_transit",
  "delivered",
];

export const MIN_DASHBOARD_METRICS = 4;

/*
 * Statuses considered "active".
 */
export const ACTIVE_REQUEST_STATUSES: RequestStatus[] = [
  "submitted",
  "review",
  "awaiting_payment",
  "paid",
  "purchased",
  "warehouse_received",
  "ready_for_international_shipping",
  "packed",
  "shipped",
  "out_for_delivery",
];

/*
 * Statuses considered "in transit".
 *
 * At the moment ShipIN has shipped and
 * out_for_delivery as its transit stages.
 */
export const IN_TRANSIT_STATUSES: RequestStatus[] = [
  "shipped",
  "out_for_delivery",
];