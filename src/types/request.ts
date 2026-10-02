import { Timestamp } from "firebase/firestore";
import type { RequestStatus } from "@/lib/requestStatus";
// Import remains safely as relative path
import type { Address } from "./address";
import type { Carrier } from "./carrier";

export interface StatusHistory {
  submitted?: Timestamp;
  review?: Timestamp;
  awaiting_payment?: Timestamp;
  paid?: Timestamp;
  refund_offered?: Timestamp;
  refund_requested?: Timestamp;
  purchased?: Timestamp;
  warehouse_received?: Timestamp;
  ready_for_international_shipping?: Timestamp;
  packed?: Timestamp;
  shipped?: Timestamp;
  out_for_delivery?: Timestamp;
  delivered?: Timestamp;
  refunded?: Timestamp;
  rejected?: Timestamp;
}

export interface RequestItem {
  name: string;
  quantity: number;
  url?: string;
  unitPrice?: number;
  subtotal?: number;
}

export type AdditionalItemRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "awaiting_payment"
  | "paid"
  | "purchased"
  | "warehouse_received"
  | "packed"
  | "cancelled";

export interface AdditionalItemRequest {
  id: string;

  item: {
    name: string;
    quantity: number;
    url?: string;
  };

  status: AdditionalItemRequestStatus;

  unitPrice?: number;
  subtotal?: number;

  serviceFee?: number;
  repackingFee?: number;
  storageFee?: number;
  totalDue?: number;

  amountPaid?: number;

  orderChangeHold?: boolean;

  // This quote belongs ONLY to the additional item
  quote?: {
    unitPrice: number;
    subtotal: number;
    serviceFee: number;
    repackingFee: number;
    storageFee: number;
    totalDue: number;
    createdAt?: Timestamp;
    expiresAt?: Timestamp;
  };

  requestedAt?: Timestamp;
  reviewedAt?: Timestamp;
  approvedAt?: Timestamp;
  paidAt?: Timestamp;
  purchasedAt?: Timestamp;
  warehouseReceivedAt?: Timestamp;
  packedAt?: Timestamp;
}

export interface QuoteBreakdown {
  productsTotal: number;
  domesticShipping: number;
  internationalShipping: number;
  serviceFee: number;
  inspectionFee?: number;
  holdFee?: number;
  grandTotal: number;
}

export interface QuoteItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Quote {
  version: number;

  items: RequestItem[];

  breakdown: QuoteBreakdown;

  serviceFeeRule?: string;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;

  expiresAt?: Timestamp;
  acceptedAt?: Timestamp;

  regeneratedCount?: number;
  expired?: boolean;
  regenerationRequested?: boolean;
}

export interface Tracking {
  internalTrackingId: string;

  carrier?: Carrier;

  trackingNumber?: string;

  trackingUrl?: string;

  estimatedDelivery?: string;

  createdAt?: Timestamp;
}

export interface Payment {
  provider: "paypal" | "wallet";
  orderId: string;
  captureId?: string;
  amount: number;
  amountPaid?: number;
  walletAmount?: number;
  paypalAmount?: number;
  processingFee?: number;
  currency?: string;
  paidAt?: Timestamp;
}

export interface AdditionalPayment {
  id: string;

  additionalItemRequestId: string;

  provider: "paypal" | "wallet";

  orderId?: string;
  captureId?: string;

  amount: number;

  currency?: string;

  status:
    | "pending"
    | "completed"
    | "failed"
    | "refunded";

  createdAt?: Timestamp;
  paidAt?: Timestamp;
}

export interface WarehouseInspection {
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  condition?: string;
  photos?: string[];
  notes?: string;
  receivedAt?: Timestamp;
}

export interface WarehouseOptions {
  inspection: "none" | "standard" | "detailed";
  shippingPreference: "auto" | "approval" | "hold";
}

export interface ServiceSelections {
  inspection: "none" | "standard" | "detailed";
  shippingPreference: "auto" | "approval" | "hold";
}

export interface StorageInfo {
  startedAt?: Timestamp;
  freeUntil?: Timestamp;
  dailyFine?: number;
  accumulatedFine?: number;
  lastFineUpdate?: Timestamp;
  active?: boolean;
}

export interface OrderChangeInfo {
  active: boolean;

  // True when the original parcel was already
  // packed before the customer requested the change
  requiresRepacking?: boolean;

  // One-time $2 charge
  repackingFee?: number;

  // One-time $3 storage charge
  storageFee?: number;

  storageFeeApplied?: boolean;

  startedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface Consolidation {
  enabled: boolean;
  clearanceId?: string;
  consolidatedAt?: Timestamp;
}

export type RefundPreference =
  | "wallet"
  | "original_payment";

export interface RefundRequest {
  status:
    | "requested"
    | "processing"
    | "completed";

  preference: RefundPreference;

  amount: number;

  walletAmount?: number;

  paypalAmount?: number;

  requestedAt?: Timestamp;

  processedAt?: Timestamp;

  /*
   * ========================================
   * ADMIN REFUND PROCESSING
   * ========================================
   *
   * These fields track which portions of
   * the refund have actually been completed.
   */

  walletAuthorization?: "authorized";

  walletAuthorizedAt?: Timestamp;

  walletStatus?: "completed";

  walletCompletedAt?: Timestamp;

  paypalRefundStatus?: "completed";

  paypalRefundAmount?: number;

  paypalRefundTransactionId?: string;

  paypalRefundedAt?: Timestamp;
}

export interface InspectionPhoto {
  id: string;
  url: string;
  caption?: string;
  uploadedAt?: Timestamp;
}

export interface WarehouseChecklist {
  packageReceived: boolean;
  inspectionCompleted: boolean;
  photosUploaded: boolean;
  measured: boolean;
  readyForShipment: boolean;
}

export interface WarehouseRecord {
  location?: string;
  shelf?: string;
  bin?: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;

  // Existing WarehousePanel fields
  condition?: string;
  notes?: string;

  // Inspection
  inspectionPhotos?: string[];

  // Checklist
  checklist?: WarehouseChecklist;

  // Timestamps
  receivedAt?: Timestamp;
  completedAt?: Timestamp;
  arrivalDate?: Timestamp;
  inspectionCompletedAt?: Timestamp;
  approvedAt?: Timestamp;
  packedAt?: Timestamp;
  holdStartedAt?: Timestamp;

  // Storage data
  storageFee?: number;
  storageDays?: number;

  photos?: string[];
}

export interface PartialRefund {
  id: string;

  amount: number;

  reason: string;

  method:
    | "wallet"
    | "original_payment";

  paypalRefundTransactionId?: string;

  createdAt?: Timestamp;

  createdBy: string;

  createdByEmail?: string;
}

export interface Request {
  id: string;
  userId: string;
  email: string;

  status: RequestStatus;

  rejectionReason?: string;
  rejectedAt?: Timestamp;

  statusHistory?: StatusHistory;
  partialRefunds?: PartialRefund[];
  totalRefundedAmount?: number;

  items: RequestItem[];

  /*
   * Customer requests to add products
   * after the original request was submitted.
   */
  additionalItemRequests?: AdditionalItemRequest[];

  /*
   * Separate payments generated by
   * approved additional items.
   */
  additionalPayments?: AdditionalPayment[];

  /*
   * Indicates that the shipment is being
   * held because of an order modification.
   */
  orderChange?: OrderChangeInfo;

  warehouseOptions: WarehouseOptions;

  serviceSelections?: ServiceSelections;

  quote?: Quote;

  quoteRegenerationRequested?: boolean;

  quoteRequestedAt?: Date | string | Timestamp | null;

  payment?: Payment;

  refundOffer?: {
    offered: boolean;
    reason?: string;
    offeredAt?: Timestamp;
  };

  partialRefundOffer?: {
  id: string;
  amount: number;
  reason: string;
  status: "offered" | "accepted" | "completed" | "declined";
  createdAt?: Timestamp;
  createdBy: string;
  createdByEmail?: string | null;
  selectedMethod?: "wallet" | "original_payment";
  selectedAt?: Timestamp;
  };
  
  refundRequest?: RefundRequest;

  tracking?: Tracking;

  warehouse?: WarehouseRecord;

  storage?: StorageInfo;

  consolidation?: Consolidation;

  // Replaced / Verified: Contains the full strongly-typed Address object
  shippingAddress?: Address;

  createdAt?: Timestamp;

  updatedAt?: Timestamp;
}
