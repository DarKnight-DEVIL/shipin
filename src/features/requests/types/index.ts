/**
 * Request feature types.
 *
 * Re-exports the canonical Request type from @/types/request
 * and adds feature-specific request/response types.
 */

export type {
  Request,
  RequestItem,
  Quote,
  QuoteBreakdown,
  QuoteItem,
  Tracking,
  Payment,
  WarehouseRecord,
  WarehouseChecklist,
  StatusHistory,
  PartialRefund,
  AdditionalItemRequest,
  AdditionalPayment,
  RefundRequest,
  ServiceSelections,
  WarehouseOptions,
  OrderChangeInfo,
  StorageInfo,
  Consolidation,
  InspectionPhoto,
} from '@/types/request';

import type { RequestItem } from '@/types/request';
import type { ServiceSelections } from '@/types/request';
import type { RequestStatus } from '@/lib/requestStatus';
import type { Address } from '@/types/address';

export interface CreateRequestInput {
  customerName: string;
  email: string;
  items: RequestItem[];
  shippingAddress: Address;
  notes?: string;
  serviceSelections?: ServiceSelections;
}

export interface UpdateRequestStatusInput {
  status: RequestStatus;
  rejectionReason?: string;
}

export interface RequestListResponse {
  requests: Request[];
  total: number;
}