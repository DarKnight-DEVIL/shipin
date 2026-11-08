import type { Request } from "@/types/request";

import { startStorageTimer } from "@/features/requests/services/warehouse";
import { updateShipmentStatus } from "@/features/requests/services/shipments";

export type WarehouseChecklistKey =
  | "packageReceived"
  | "inspectionCompleted"
  | "photosUploaded"
  | "measured"
  | "readyForShipment";

export type WarehouseChecklistEntry = {
  packageReceived: boolean;
  inspectionCompleted: boolean;
  photosUploaded: boolean;
  measured: boolean;
  readyForShipment: boolean;
};

export function warehouseShippingPreference(
  request: Request
): "auto" | "approval" | "hold" {
  return (
    request.serviceSelections?.shippingPreference ?? "approval"
  ) as "auto" | "approval" | "hold";
}

/**
 * Return the downstream side effects WarehousePanel triggers after a
 * checklist write succeeds. The panel keeps the Firestore write and the
 * optimistic-UI rollback; this helper only decides whether an additional
 * status change or timer start is required.
 */
export async function applyWarehouseChecklistSideEffects(
  request: Request,
  key: WarehouseChecklistKey,
  value: boolean,
  previousValue: boolean
): Promise<void> {
  if (
    key !== "packageReceived" &&
    key !== "inspectionCompleted" &&
    key !== "readyForShipment"
  ) {
    return;
  }

  if (key === "packageReceived" && value && !previousValue) {
    await updateShipmentStatus(request.id, "warehouse_received");
    return;
  }

  if (
    key === "inspectionCompleted" &&
    value &&
    !previousValue &&
    warehouseShippingPreference(request) === "approval"
  ) {
    await startStorageTimer(request.id);
    return;
  }

  if (key === "readyForShipment" && value && !previousValue) {
    await updateShipmentStatus(
      request.id,
      "ready_for_international_shipping"
    );
  }
}
