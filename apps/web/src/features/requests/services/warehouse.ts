import {
  serverTimestamp,
  updateDoc,
  doc,
  arrayUnion,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebaseDb";
import { toShipINError } from "@/utils/errors";
import { createNotification } from "@/features/notifications/services";
import type { Request } from "@/types/request";
import { getStorageParams } from "./warehousePolicy";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getWarehouseInventory(): Promise<Request[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "requests"),
        where("status", "in", [
          "warehouse_received",
          "ready_for_international_shipping",
          "packed",
        ])
      )
    );

    return snapshot.docs.map((document) => ({
      id: document.id,
      ...(document.data() as Omit<Request, "id">),
    }));
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
