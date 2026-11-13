/**
 * @fileoverview Shipments feature – barrel export.
 */

export {
  createShipment,
  addRequestToShipment,
  getShipment,
  getShipmentRequests,
  getUserShipments,
  markShipmentShipped,
  markShipmentDelivered,
  removeRequestFromShipment,
  saveConsolidatedPackage,
  finalizeShipment,
} from './services/shipments';

export { generateTrackingId } from './services/tracking';

