import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./firebase";

export async function createShipment(
  userId: string
) {
  const ref = await addDoc(
    collection(db, "shipments"),
    {
      userId,

      requestIds: [],

      status: "building",

      tracking: "",

      courier: "",

      weight: 0,

      length: 0,

      width: 0,

      height: 0,

      createdAt: serverTimestamp(),

      updatedAt: serverTimestamp(),
    }
  );

  return ref.id;
}

export async function addRequestToShipment(
  shipmentId: string,
  requestId: string
) {
  const shipmentRef = doc(
    db,
    "shipments",
    shipmentId
  );

  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  const shipmentSnap = await getDoc(
    shipmentRef
  );

  if (!shipmentSnap.exists()) {
    throw new Error("Shipment not found.");
  }

  await updateDoc(shipmentRef, {
    requestIds: arrayUnion(requestId),

    updatedAt: serverTimestamp(),
  });

  await updateDoc(requestRef, {
    consolidation: {
      enabled: true,

      shipmentId,

      consolidatedAt:
        serverTimestamp(),
    },
  });
}

export async function getShipment(
  shipmentId: string
): Promise<any | null> {
  const ref = doc(db, "shipments", shipmentId);

  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...(snap.data() as any),
  };
}

export async function getShipmentRequests(
  shipmentId: string
) {
  const shipment: any = await getShipment(shipmentId);

  if (!shipment) return [];

  if (
    !shipment.requestIds ||
    shipment.requestIds.length === 0
  ) {
    return [];
  }

  const q = query(
    collection(db, "requests"),
    where("__name__", "in", shipment.requestIds)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));
}

export async function getUserShipments(
  userId: string
) {
  const q = query(
    collection(db, "shipments"),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));
}

export async function markShipmentShipped(
  shipmentId: string
) {
  await updateDoc(
    doc(db, "shipments", shipmentId),
    {
      status: "shipped",
      shippedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
}

export async function markShipmentDelivered(
  shipmentId: string
) {
  await updateDoc(
    doc(db, "shipments", shipmentId),
    {
      status: "delivered",
      deliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
}

export async function removeRequestFromShipment(
  shipmentId: string,
  requestId: string
) {
  const shipmentRef = doc(
    db,
    "shipments",
    shipmentId
  );

  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  await updateDoc(shipmentRef, {
    requestIds: arrayRemove(requestId),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(requestRef, {
    consolidation: {
      enabled: false,
      shipmentId: null,
      consolidatedAt: null,
    },
  });
}

export async function saveConsolidatedPackage(
  shipmentId: string,
  packageData: {
    weight: number;
    length: number;
    width: number;
    height: number;
  }
) {
  const shipmentRef = doc(
    db,
    "shipments",
    shipmentId
  );

  await updateDoc(shipmentRef, {
    weight: packageData.weight,
    length: packageData.length,
    width: packageData.width,
    height: packageData.height,

    updatedAt: serverTimestamp(),
  });
}

export async function finalizeShipment(
  shipmentId: string
) {
  const shipmentRef = doc(
    db,
    "shipments",
    shipmentId
  );

  const shipmentSnap =
    await getDoc(shipmentRef);

  if (!shipmentSnap.exists()) {
    throw new Error(
      "Shipment not found."
    );
  }

  const shipment =
    shipmentSnap.data();

  if (
    !shipment.requestIds ||
    shipment.requestIds.length === 0
  ) {
    throw new Error(
      "Cannot finalize an empty shipment."
    );
  }

  if (
    !shipment.weight ||
    !shipment.length ||
    !shipment.width ||
    !shipment.height
  ) {
    throw new Error(
      "Enter the final package weight and dimensions before finalizing."
    );
  }

  await updateDoc(shipmentRef, {
    status: "ready",
    finalizedAt:
      serverTimestamp(),
    updatedAt:
      serverTimestamp(),
  });
}