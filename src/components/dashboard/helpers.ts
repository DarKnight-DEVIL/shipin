import type { LucideIcon } from "lucide-react";
import type { DashboardMetricId } from "@/features/users/services/dashboardMetrics";
import type { RequestStatus } from "@/features/requests/services/requestStatus";
import {
  Activity,
  ClipboardList,
  FileText,
  CreditCard,
  CheckCircle2,
  ShoppingBag,
  Boxes,
  Package,
  Send,
  Plane,
  Truck,
  Undo2,
  Plus,
  MapPin,
  MessageCircle,
  Wallet,
} from "lucide-react";

export const SHORTCUTS: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { href: "/requests/new", label: "New request", description: "Start with a product link", icon: Plus },
  { href: "/wallet", label: "Wallet", description: "Funds and payments", icon: Wallet },
  { href: "/addresses", label: "Addresses", description: "Where we deliver", icon: MapPin },
  { href: "/support", label: "Support", description: "Questions about a quote, payment or delivery", icon: MessageCircle },
];

export function getMetricHref(id: DashboardMetricId): string {
  switch (id) {
    case "active": return "/requests";
    case "submitted": return "/requests?status=submitted";
    case "quote_ready": return "/requests?status=review";
    case "awaiting_payment": return "/requests?status=awaiting_payment";
    case "paid": return "/requests?status=paid";
    case "purchased": return "/requests?status=purchased";
    case "warehouse_received": return "/requests?status=warehouse_received";
    case "ready_for_international_shipping": return "/requests?status=ready_for_international_shipping";
    case "packed": return "/requests?status=packed";
    case "shipped": return "/requests?status=shipped";
    case "in_transit": return "/requests?status=in_transit";
    case "out_for_delivery": return "/requests?status=out_for_delivery";
    case "delivered": return "/requests?status=delivered";
    case "refunded": return "/requests?status=refunded";
    default: return "/requests";
  }
}

export const METRIC_ICONS: Partial<Record<DashboardMetricId, LucideIcon>> = {
  active: Activity,
  submitted: ClipboardList,
  quote_ready: FileText,
  awaiting_payment: CreditCard,
  paid: CheckCircle2,
  purchased: ShoppingBag,
  warehouse_received: Boxes,
  ready_for_international_shipping: Package,
  packed: Package,
  shipped: Send,
  in_transit: Plane,
  out_for_delivery: Truck,
  delivered: CheckCircle2,
  refunded: Undo2,
};

export const SHIPMENT_PHASES: { label: string; statuses: RequestStatus[] }[] = [
  { label: "Requested", statuses: ["submitted", "review", "awaiting_payment"] },
  { label: "Paid", statuses: ["paid"] },
  { label: "Purchased", statuses: ["purchased"] },
  { label: "At warehouse", statuses: ["warehouse_received", "ready_for_international_shipping", "packed"] },
  { label: "In transit", statuses: ["shipped", "out_for_delivery"] },
  { label: "Delivered", statuses: ["delivered"] },
];
