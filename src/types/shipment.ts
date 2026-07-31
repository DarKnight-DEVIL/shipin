import { Timestamp } from "firebase/firestore";

export interface Shipment {
  id: string;

  userId: string;

  requestIds: string[];

  tracking?: string;

  courier?: string;

  weight?: number;

  length?: number;

  width?: number;

  height?: number;

  status:
    | "building"
    | "ready"
    | "shipped"
    | "delivered";

  createdAt?: Timestamp;

  updatedAt?: Timestamp;
}