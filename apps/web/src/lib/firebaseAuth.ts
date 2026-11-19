import { getAuth } from "firebase-admin/auth";

export const adminAuth = getAuth;

/** Type-safe admin auth instance. */
export type { Auth } from "firebase-admin/auth";