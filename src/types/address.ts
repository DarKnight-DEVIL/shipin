import { Timestamp } from "firebase/firestore";

export interface Address {
  id: string;

  label: string;

  recipientName: string;

  phone: string;

  email?: string;

  country: string;

  state: string;

  city: string;

  postalCode: string;

  addressLine1: string;

  addressLine2?: string;

  isDefault: boolean;

  createdAt?: Timestamp;

  updatedAt?: Timestamp;
}