import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc,
  onSnapshot,
  Timestamp,
  arrayUnion,
} from "firebase/firestore";

import { db } from "./firebase";
import type { Request, Quote } from "@/types/request";

/* =========================================
   ADDRESSES
========================================= */

export const addAddress = async (
  address: any,
  userId: string
) => {
  await addDoc(collection(db, "addresses"), {
    ...address,
    userId,
    createdAt: serverTimestamp(),
  });
};

export const getAddresses = async (
  userId: string
) => {
  const q = query(
    collection(db, "addresses"),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

/* =========================================
   REQUESTS
========================================= */

export const addRequest = async (
  requestData: any,
  userId: string
) => {
  await addDoc(collection(db, "requests"), {
    userId,

    customerName: requestData.customerName,
    email: requestData.email,

    items: requestData.items,
    addressId: requestData.addressId,
    notes: requestData.notes,

    serviceSelections: {
      inspection:
        requestData.serviceSelections?.inspection ??
        "standard",

      shippingPreference:
        requestData.serviceSelections
          ?.shippingPreference ??
        "approval",
    },

    status: "submitted",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const getRequests = async (
  userId: string
) => {
  const q = query(
    collection(db, "requests"),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const getRequestById = async (
  requestId: string
): Promise<Request | null> => {
  const snapshot = await getDoc(
    doc(db, "requests", requestId)
  );

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  } as Request;
};

export const updateRequestStatus = async (
  requestId: string,
  status: string
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  await updateDoc(requestRef, {
    status,
    updatedAt: serverTimestamp(),
  });
};

/* =========================================
   ITEM LEVEL QUOTES
========================================= */

export const saveDetailedQuote = async (
  requestId: string,
  quote: Quote
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  // Read the current document data to see if a quote already exists
  const snapshot = await getDoc(requestRef);
  const existingData = snapshot.exists() ? snapshot.data() : null;
  const existingQuote = existingData?.quote;

  await updateDoc(requestRef, {
    quote: {
      version: 1,
      items: quote.items,
      
      breakdown: {
        productsTotal: quote.breakdown.productsTotal,
        domesticShipping: quote.breakdown.domesticShipping,
        internationalShipping: quote.breakdown.internationalShipping,
        serviceFee: quote.breakdown.serviceFee,
        grandTotal: quote.breakdown.grandTotal,
      },

      serviceFeeRule: quote.serviceFeeRule,
      
      // Keep original timestamp if updating, otherwise set fresh
      createdAt: existingQuote?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    
    status: "payment",
    quoteCreatedAt: existingQuote?.quoteCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/* =========================================
   PAYMENT
========================================= */

export const markRequestPaid = async (
  requestId: string,
  paymentData: {
    orderId: string;
    captureId?: string;
    amount: number;
  }
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  await updateDoc(requestRef, {
    status: "paid",

    payment: {
      provider: "paypal",
      orderId:
        paymentData.orderId,
      captureId:
        paymentData.captureId ||
        null,
      amount:
        paymentData.amount,
      paidAt:
        serverTimestamp(),
    },

    updatedAt:
      serverTimestamp(),
  });
};

/* =========================================
   SHIPMENT TRACKING
========================================= */

export const saveShipmentDetails = async (
  requestId: string,
  shipment: {
    carrier: string;
    trackingNumber: string;
    estimatedDelivery: string;
    trackingUrl: string;
  }
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  await updateDoc(requestRef, {
    tracking: {
      carrier:
        shipment.carrier,
      trackingNumber:
        shipment.trackingNumber,
      estimatedDelivery:
        shipment.estimatedDelivery,
      trackingUrl:
        shipment.trackingUrl,
    },

    updatedAt:
      serverTimestamp(),
  });
};

export const updateShipmentStatus = async (
  requestId: string,
  status: string
) => {
  const requestRef = doc(
    db,
    "requests",
    requestId
  );

  const updateData: any = {
    status,
    updatedAt: serverTimestamp(),
  };

  if (status === "delivered") {
    updateData.deliveredAt =
      serverTimestamp();
  }

  await updateDoc(requestRef, updateData);
};

/* =========================================
   ADMIN FUNCTIONS
========================================= */

export const getAllRequests = async () => {
  const snapshot = await getDocs(
    collection(db, "requests")
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const getRequestsByStatus = async (
  status: string
) => {
  const q = query(
    collection(db, "requests"),
    where("status", "==", status)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const createNotification = async (
  userId: string,
  requestId: string,
  title: string,
  message: string,
  type: string
) => {
  await addDoc(
    collection(db, "notifications"),
    {
      userId,
      requestId,
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
    }
  );
};

export const getNotifications = async (
  userId: string
) => {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const markNotificationRead = async (
  notificationId: string
) => {
  const notificationRef = doc(
    db,
    "notifications",
    notificationId
  );

  await updateDoc(notificationRef, {
    read: true,
  });
};

/* =========================================
   REALTIME LISTENERS
========================================= */

export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: any[]) => void
) => {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const notifications =
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

    callback(notifications);
  });
};

export const subscribeToRequests = (
  userId: string,
  callback: (requests: any[]) => void
) => {
  const q = query(
    collection(db, "requests"),
    where("userId", "==", userId)
  );

  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    callback(requests);
  });
};

/* =========================================
   SUPPORT TICKETS & MESSAGING (COLLECTIONS)
========================================= */

export const createSupportTicket = async ({
  requestId,
  customerId,
  category,
  subject,
  firstMessage,
}: {
  requestId: string;
  customerId: string;
  category: string;
  subject: string;
  firstMessage: string;
}) => {
  // Create the ticket
  const ticketRef = await addDoc(
    collection(db, "supportTickets"),
    {
      requestId,
      customerId,
      category,
      subject,
      status: "open",
      customerUnread: false,
      adminUnread: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      resolvedAt: null,
    }
  );

  const ticketNumber = `TCK-${ticketRef.id
    .substring(0, 6)
    .toUpperCase()}`;

  await updateDoc(
    doc(db, "supportTickets", ticketRef.id),
    {
      ticketNumber,
    }
  );

  // Create the first message
  await addDoc(
    collection(db, "supportMessages"),
    {
      ticketId: ticketRef.id,
      sender: "customer",
      message: firstMessage,
      createdAt: serverTimestamp(),
    }
  );

  return ticketRef.id;
};

export const sendSupportMessage = async ({
  ticketId,
  sender,
  message,
}: {
  ticketId: string;
  sender: "customer" | "admin";
  message: string;
}) => {
  await addDoc(
    collection(db, "supportMessages"),
    {
      ticketId,
      sender,
      message,
      createdAt: serverTimestamp(),
    }
  );

  await updateDoc(
    doc(db, "supportTickets", ticketId),
    {
      updatedAt: serverTimestamp(),
      adminUnread: sender === "customer",
      customerUnread: sender === "admin",
    }
  );
};

export const markSupportTicketRead = async (
  ticketId: string,
  role: "customer" | "admin"
) => {
  await updateDoc(
    doc(db, "supportTickets", ticketId),
    role === "customer"
      ? {
          customerUnread: false,
        }
      : {
          adminUnread: false,
        }
  );
};

export const getSupportTickets = async (
  requestId: string
) => {
  const q = query(
    collection(db, "supportTickets"),
    where("requestId", "==", requestId),
    orderBy("updatedAt", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const getSupportMessages = async (
  ticketId: string
) => {
  const q = query(
    collection(db, "supportMessages"),
    where("ticketId", "==", ticketId),
    orderBy("createdAt")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

export const resolveSupportTicket = async (
  ticketId: string
) => {
  await updateDoc(
    doc(db, "supportTickets", ticketId),
    {
      status: "resolved",
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
};

export const subscribeToSupportTickets = (
  requestId: string,
  callback: (tickets: any[]) => void
) => {
  const q = query(
    collection(db, "supportTickets"),
    where("requestId", "==", requestId),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );
  });
};

export const subscribeToSupportMessages = (
  ticketId: string,
  callback: (messages: any[]) => void
) => {
  const q = query(
    collection(db, "supportMessages"),
    where("ticketId", "==", ticketId),
    orderBy("createdAt")
  );

  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
    );
  });
};

/* =========================================
   WAREHOUSE PROCESSING
========================================= */

export async function saveWarehouseMeasurements(
  requestId: string,
  data: {
    weight: number;
    length: number;
    width: number;
    height: number;
  }
) {
  await updateDoc(doc(db, "requests", requestId), {
    "warehouse.weight": data.weight,
    "warehouse.length": data.length,
    "warehouse.width": data.width,
    "warehouse.height": data.height,

    updatedAt: serverTimestamp(),
  });
}

export async function updateWarehouseChecklist(
  requestId: string,
  checklist: {
    packageReceived?: boolean;
    inspectionCompleted?: boolean;
    photosUploaded?: boolean;
    measured?: boolean;
    readyForShipment?: boolean;
  }
) {
  const updates: Record<string, any> = {};

  Object.entries(checklist).forEach(([key, value]) => {
    updates[`warehouse.checklist.${key}`] = value;
  });

  updates.updatedAt = serverTimestamp();

  await updateDoc(
    doc(db, "requests", requestId),
    updates
  );
}

export async function saveInspectionPhoto(
  requestId: string,
  photo: {
    id: string;
    url: string;
    caption?: string;
  }
) {
  await updateDoc(doc(db, "requests", requestId), {
    "warehouse.inspectionPhotos": arrayUnion({
      ...photo,
      uploadedAt: serverTimestamp(),
    }),

    updatedAt: serverTimestamp(),
  });
}

export async function approveInternationalShipment(
  requestId: string
) {
  await updateDoc(
    doc(db, "requests", requestId),
    {
      status: "ready_for_international_shipping",

      approvedAt: serverTimestamp(),

      updatedAt: serverTimestamp(),
    }
  );
}

export async function startStorageTimer(
  requestId: string
) {
  const now = Timestamp.now();

  const freeUntil = Timestamp.fromMillis(
    now.toMillis() +
      48 * 60 * 60 * 1000
  );

  await updateDoc(
    doc(db, "requests", requestId),
    {
      storage: {
        startedAt: now,

        freeUntil,

        dailyFine: 3,

        accumulatedFine: 0,

        active: true,
      },

      updatedAt: serverTimestamp(),
    }
  );
}