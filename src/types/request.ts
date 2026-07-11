import { Timestamp } from "firebase/firestore";
import type { RequestStatus } from "@/lib/requestStatus";

export interface RequestItem {
  name: string;
  quantity: number;
  url?: string;

  unitPrice?: number;
  subtotal?: number;
}

export interface QuoteBreakdown {
  productsTotal: number;
  domesticShipping: number;
  internationalShipping: number;
  serviceFee: number;
  inspectionFee?: number; // Step 4: Added to handle the updated quote data breakdown structure
  holdFee?: number;       // Step 4: Added to handle the updated quote data breakdown structure
  grandTotal: number;
}

export interface Quote {
  version: number;

  items: RequestItem[];

  breakdown: QuoteBreakdown;

  serviceFeeRule?: string;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Tracking {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
}

export interface Payment {
  provider: "paypal";

  orderId: string;
  captureId?: string;

  amount: number;
  currency?: string;

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
  inspection:
    | "none"
    | "standard"
    | "detailed";

  shippingPreference:
    | "auto"
    | "approval"
    | "hold";
}

// Step 2: Added just above the Request interface
export interface ServiceSelections {
  inspection:
    | "none"
    | "standard"
    | "detailed";

  shippingPreference:
    | "auto"
    | "approval"
    | "hold";
}

export interface StorageInfo {
  startedAt?: Timestamp;

  freeUntil?: Timestamp;

  dailyFine?: number;

  accumulatedFine?: number;

  lastFineUpdate?: Timestamp;

  active?: boolean;
}

// Step 1 & 3: Updated Request interface with serviceSelections
export interface Request {
  id: string;

  userId: string;

  email: string;

  status: RequestStatus;

  items: RequestItem[];

  warehouseOptions: WarehouseOptions;

  serviceSelections?: ServiceSelections; // Step 3: Added optional property

  quote?: Quote;

  payment?: Payment;

  tracking?: Tracking;

  warehouse?: WarehouseRecord;

  storage?: StorageInfo;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
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
  // Measurements
  weight?: number;
  length?: number;
  width?: number;
  height?: number;

  // Existing WarehousePanel fields
  condition?: string;
  notes?: string;

  // Inspection
  inspectionPhotos?: InspectionPhoto[];

  // Checklist
  checklist?: WarehouseChecklist;

  // Timestamps
  receivedAt?: Timestamp;
  completedAt?: Timestamp;
}