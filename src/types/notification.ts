import { Timestamp } from "firebase/firestore";

export interface Notification {
  id: string;

  userId: string;

  title: string;

  message: string;

  type:
    | "quote"
    | "payment"
    | "warehouse"
    | "inspection"
    | "shipment"
    | "delivery"
    | "system";

  requestId?: string;

  read: boolean;

  createdAt?: Timestamp;
}