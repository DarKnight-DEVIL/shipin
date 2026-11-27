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
} from "./client/shipments";
