import {
  serverTimestamp,
  updateDoc,
  doc,
  arrayUnion,
  getDoc,
  arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebaseDb";
import { toShipINError } from "@/utils/errors";
import { createNotification } from "@/features/notifications/client";
import { getAdminRequestPage } from "@/features/admin/client/requestQueueClient";
import { REQUEST_STATUS } from "../services/requestStatus";
import type { Request } from "@/types/request";
import { getStorageParams } from "../services/warehousePolicy";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The statuses the warehouse board shows, as one `in` query server-side. */
const WAREHOUSE_STATUSES = [
  REQUEST_STATUS.warehouse_received,
  REQUEST_STATUS.ready_for_international_shipping,
  REQUEST_STATUS.packed,
] as const;

/**
 * The warehouse board, in bounded pages.
 *
 * This used to be a client-SDK `getDocs` over every request in three
 * statuses — the same unbounded read the admin queue shipped with (see
 * docs/AUDIT.md §2.3). It now pages through `/api/admin/requests`, which
 * serves the three statuses as one `in` query and returns whole documents,
 * so the page renders the same rows without re-fetching the collection on
 * every visit.
 */
export async function getWarehouseInventory(): Promise<Request[]> {
  try {
    const collected: Request[] = [];
    let cursor: string | null = null;

    // Same safety net as the admin queue client: 200 pages is 20,000 rows.
    for (let page = 0; page < 200; page += 1) {
      const result = await getAdminRequestPage({
        statuses: WAREHOUSE_STATUSES,
        cursor,
      });
      collected.push(...result.requests);

      if (!result.hasMore || !result.nextCursor) return collected;
      cursor = result.nextCursor;
    }

    return collected;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function saveWarehouseInspection(
  requestId: string,
  data: {
    weight: number;
    length: number;
    width: number;
    height: number;
    condition: string;
  }
): Promise<void> {
  try {
    const requestRef = doc(db, "requests", requestId);
    const snapshot = await getDoc(requestRef);
    const userId = snapshot.exists() ? snapshot.data()?.userId : null;

    await updateDoc(requestRef, {
      "warehouse.weight": data.weight,
      "warehouse.length": data.length,
      "warehouse.width": data.width,
      "warehouse.height": data.height,
      "warehouse.condition": data.condition,
      "warehouse.inspectionCompletedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (userId) {
      await createNotification(
        userId,
        requestId,
        "Inspection Complete",
        "Your warehouse inspection is now available.",
        "inspection"
      );
    }
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function saveInspectionPhoto(
  requestId: string,
  photo: { id: string; url: string; caption?: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, "requests", requestId), {
      "warehouse.inspectionPhotos": arrayUnion({
        ...photo,
        uploadedAt: serverTimestamp(),
      }),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function approveInternationalShipment(
  requestId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, "requests", requestId), {
      status: "ready_for_international_shipping",
      "warehouse.approvedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function startStorageTimer(
  requestId: string,
  options: { shippingPreference?: string; storageType?: string | null } = {}
): Promise<void> {
  try {
    const startedAt = Date.now();
    const { dailyFine, freeStorageDays } = getStorageParams(
      options.shippingPreference ?? "approval",
      options.storageType ?? null
    );

    await updateDoc(doc(db, "requests", requestId), {
      storage: {
        startedAt,
        // The grace window has to be written here: this path writes the whole
        // storage object, so leaving freeUntil at "now" started billing the
        // customer on day zero.
        freeUntil: startedAt + freeStorageDays * DAY_MS,
        freeStorageDays,
        dailyFine,
        accumulatedFine: 0,
        active: true,
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function saveWarehouseMeasurements(
  requestId: string,
  data: {
    weight: number;
    length: number;
    width: number;
    height: number;
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, "requests", requestId), {
      "warehouse.weight": data.weight,
      "warehouse.length": data.length,
      "warehouse.width": data.width,
      "warehouse.height": data.height,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function removeRequestFromWarehouse(
  requestId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, "requests", requestId), {
      warehouse: arrayRemove({}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}
export async function updateWarehouseChecklist(
  requestId: string,
  checklist: Partial<{
    packageReceived?: boolean;
    inspectionCompleted?: boolean;
    photosUploaded?: boolean;
    measured?: boolean;
    readyForShipment?: boolean;
  }>
): Promise<void> {
  try {
    const requestRef = doc(db, "requests", requestId);
    const snapshot = await getDoc(requestRef);
    const userId = snapshot.exists() ? snapshot.data()?.userId : null;

    const updates: Record<string, unknown> = {};
    Object.entries(checklist).forEach(([key, value]) => {
      updates[`warehouse.checklist.${key}`] = value;
    });
    updates.updatedAt = serverTimestamp();

    await updateDoc(requestRef, updates);

    if (userId && checklist.packageReceived === true) {
      await createNotification(
        userId,
        requestId,
        "Package Arrived",
        "Your package has been checked into our warehouse.",
        "warehouse"
      );
    }
  } catch (error) {
    throw toShipINError(error);
  }
}
