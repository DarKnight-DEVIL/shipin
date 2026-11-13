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
} from 'firebase/firestore';
import { db } from "@/lib/firebaseDb";
import { toShipINError } from '@/utils/errors';
import { createNotification } from '@/features/notifications/services';
import type { Request } from '@/types/request';

export async function getWarehouseInventory(): Promise<Request[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'requests'),
        where('status', 'in', [
          'warehouse_received',
          'ready_for_international_shipping',
          'packed',
        ])
      )
    );

    return snapshot.docs.map((document) => ({
      id: document.id,
      ...(document.data() as Omit<Request, 'id'>),
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
    const requestRef = doc(db, 'requests', requestId);
    const snapshot = await getDoc(requestRef);
    const userId = snapshot.exists() ? snapshot.data()?.userId : null;

    await updateDoc(requestRef, {
      'warehouse.weight': data.weight,
      'warehouse.length': data.length,
      'warehouse.width': data.width,
      'warehouse.height': data.height,
      'warehouse.condition': data.condition,
      'warehouse.inspectionCompletedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (userId) {
      await createNotification(
        userId,
        requestId,
        'Inspection Complete',
        'Your warehouse inspection is now available.',
        'inspection'
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
    await updateDoc(doc(db, 'requests', requestId), {
      'warehouse.inspectionPhotos': arrayUnion({
        ...photo,
        uploadedAt: serverTimestamp(),
      }),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

/**
 * Add a single inspection photo to a request's warehouse record.
 * Alias kept for backward compatibility with older call sites.
 *
 * @deprecated Use saveInspectionPhoto instead.
 */
export async function saveInspectionPhotosAlias(
  requestId: string,
  photo: { id: string; url: string; caption?: string }
): Promise<void> {
  return saveInspectionPhoto(requestId, photo);
}

export async function approveInternationalShipment(requestId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'requests', requestId), {
      status: 'ready_for_international_shipping',
      'warehouse.approvedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function startStorageTimer(requestId: string): Promise<void> {
  try {
    const now = serverTimestamp();
    await updateDoc(doc(db, 'requests', requestId), {
      storage: {
        startedAt: now,
        freeUntil: now, // Will be set properly on server
        dailyFine: 3,
        accumulatedFine: 0,
        active: true,
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

/**
 * @deprecated Use saveInspectionPhoto instead. Kept for backward compatibility.
 */
export const saveInspectionPhotos = saveInspectionPhoto;

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
    await updateDoc(doc(db, 'requests', requestId), {
      'warehouse.weight': data.weight,
      'warehouse.length': data.length,
      'warehouse.width': data.width,
      'warehouse.height': data.height,
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
    await updateDoc(doc(db, 'requests', requestId), {
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
    const requestRef = doc(db, 'requests', requestId);
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
        'Package Arrived',
        'Your package has been checked into our warehouse.',
        'warehouse'
      );
    }
  } catch (error) {
    throw toShipINError(error);
  }
}