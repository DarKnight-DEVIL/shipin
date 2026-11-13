/**
 * @fileoverview Requests feature – barrel export.
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

export type {
  CreateRequestInput,
  UpdateRequestStatusInput,
  RequestListResponse,
} from './types';

export type { RequestStatus } from './services/requestStatus';

export { REQUEST_STATUS } from './services/requestStatus';

export {
  createRequest,
  getRequests,
  getRequestById,
  updateRequestStatus,
  subscribeToRequests,
  subscribeToRequest,
  addRequest,
  rejectRequest,
  requestQuoteRegeneration,
  recordPayment,
  approveAdditionalItem,
  rejectAdditionalItem,
  updateAdditionalItemStatus,
} from './services/requests';

export { saveDetailedQuote, acceptQuote, regenerateQuote } from './services/quotes';
export { resolvePageTitle } from './services/requestFilters';
export {
  getWarehouseInventory,
  saveWarehouseInspection,
  saveInspectionPhoto,
  saveInspectionPhotosAlias,
  approveInternationalShipment,
  startStorageTimer,
  saveWarehouseMeasurements,
  removeRequestFromWarehouse,
  updateWarehouseChecklist,
} from './services/warehouse';
export { getStorageParams } from './services/warehousePolicy';
export {
  warehouseShippingPreference,
  applyWarehouseChecklistSideEffects,
} from './services/warehouseWorkflow';

