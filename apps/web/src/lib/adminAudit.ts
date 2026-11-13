import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Security-relevant actions an administrator can take.
 *
 * Keep this list closed: an audit trail with free-form action strings is
 * impossible to query reliably.
 */
export type AdminAuditAction =
  | "refund.initiated"
  | "refund.offered"
  | "refund.partial_offered"
  | "refund.partial_completed"
  | "refund.paypal_recorded"
  | "refund.completed"
  | "wallet.credit"
  | "wallet.refund"
  | "wallet.balance_read"
  | "mfa.reset";

export interface AdminAuditEvent {
  actorUid: string;
  actorEmail?: string | null;
  action: AdminAuditAction;
  targetType: "request" | "user";
  targetId: string;
  /** Optional structured context (amounts, payment split, reason). */
  detail?: Record<string, unknown>;
}

/**
 * Append one entry to `adminAuditLog`.
 *
 * Deliberately best-effort: the money-moving write has already committed by
 * the time this runs, so failing the request here would report an error for
 * an operation that did happen. A failed write is surfaced in the logs with
 * enough context to reconstruct the missing entry.
 */
export async function recordAdminAudit(event: AdminAuditEvent): Promise<void> {
  try {
    await adminDb.collection("adminAuditLog").add({
      actorUid: event.actorUid,
      actorEmail: event.actorEmail ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      detail: event.detail ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Admin audit log write failed:", {
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      actorUid: event.actorUid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
  }
}
