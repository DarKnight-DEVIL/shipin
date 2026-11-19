/**
 * DPDP Act 2023 - Data Breach Notification (Sec 9)
 *
 * 72-hour breach notification to Data Protection Board and affected users
 */

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { serverEnv } from "@/config/env";
import { fetchWithTimeout } from "@/lib/http";
import { logger } from "../logger";
import { PERSONAL_DATA_CATEGORIES } from "./dpdp";

export interface BreachRecord {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedCategories: (typeof PERSONAL_DATA_CATEGORIES)[keyof typeof PERSONAL_DATA_CATEGORIES][];
  estimatedAffectedUsers: number;
  discoveredAt: Date;
  containedAt?: Date;
  rootCause?: string;
  remediationSteps?: string[];
  reportedToBoard: boolean;
  reportedToUsers: boolean;
  status: "open" | "contained" | "resolved" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Record a personal data breach (DPDP Sec 9 - 72 hours to Board)
 *
 * Authorization is the caller's job: this module has no request to inspect, and
 * re-checking a role here would only duplicate the route guard. The one caller,
 * `/api/compliance/breach`, runs `requireAdmin` first, so anything new that
 * records a breach must be admin/DPO-gated the same way. Writes are unauthenticated
 * by the Admin SDK, which is why the guard cannot live below this line.
 */
export async function recordBreach(params: {
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedCategories: string[];
  estimatedAffectedUsers: number;
  discoveredAt: Date;
  containedAt?: Date;
  rootCause?: string;
  remediationSteps?: string[];
  reportedToBoard: boolean;
  reportedToUsers: boolean;
}): Promise<string> {
  const docRef = await adminDb.collection("dataBreaches").add({
    severity: params.severity,
    description: params.description,
    affectedCategories: params.affectedCategories,
    estimatedAffectedUsers: params.estimatedAffectedUsers,
    discoveredAt: params.discoveredAt,
    containedAt: params.containedAt || null,
    rootCause: params.rootCause || null,
    remediationSteps: params.remediationSteps || [],
    reportedToBoard: params.reportedToBoard,
    reportedToUsers: params.reportedToUsers,
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // A critical breach has a 72-hour statutory clock, so it cannot depend on
  // someone reading application logs. It is logged at error level and, when a
  // webhook is configured, pushed to the on-call channel.
  if (params.severity === "critical") {
    logger.error("CRITICAL BREACH RECORDED", {
      breachId: docRef.id,
      severity: params.severity,
      estimatedAffectedUsers: params.estimatedAffectedUsers,
      affectedCategories: params.affectedCategories,
    });
    await alertCriticalBreach(docRef.id, params);
  }

  return docRef.id;
}

/**
 * Send a critical breach to the incident channel.
 *
 * Fire-and-forget by design: the breach record is already written, and a failed
 * page must not fail the caller that reported the incident.
 */
async function alertCriticalBreach(
  breachId: string,
  params: {
    severity: string;
    description: string;
    estimatedAffectedUsers: number;
  }
): Promise<void> {
  const webhook = serverEnv.BREACH_ALERT_WEBHOOK_URL;

  if (!webhook) {
    logger.error(
      "No BREACH_ALERT_WEBHOOK_URL configured for a critical breach",
      { breachId }
    );
    return;
  }

  try {
    const response = await fetchWithTimeout(
      webhook,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `CRITICAL data breach recorded: ${params.description} (${params.estimatedAffectedUsers} users affected, id ${breachId})`,
          breachId,
          severity: params.severity,
          estimatedAffectedUsers: params.estimatedAffectedUsers,
        }),
      },
      5_000
    );

    if (!response.ok) {
      logger.error("Breach alert webhook rejected the notification", {
        breachId,
        status: response.status,
      });
    }
  } catch (error) {
    logger.error("Breach alert webhook failed", {
      breachId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Update breach record
 */
export async function updateBreach(
  breachId: string,
  updates: Partial<{
    containedAt: Date;
    rootCause: string;
    remediationSteps: string[];
    reportedToBoard: boolean;
    reportedToUsers: boolean;
    status: "open" | "contained" | "resolved" | "closed";
  }>
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await adminDb.collection("dataBreaches").doc(breachId).update(updateData);
}

/**
 * Get breach by ID
 */
export async function getBreach(
  breachId: string
): Promise<BreachRecord | null> {
  const doc = await adminDb.collection("dataBreaches").doc(breachId).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    id: doc.id,
    severity: data.severity as BreachRecord["severity"],
    description: data.description as string,
    affectedCategories: (data.affectedCategories as string[]) || [],
    estimatedAffectedUsers: Number(data.estimatedAffectedUsers) || 0,
    discoveredAt: data.discoveredAt?.toDate?.() || new Date(),
    containedAt: (data.containedAt as Date) || null,
    rootCause: (data.rootCause as string) || null,
    remediationSteps: (data.remediationSteps as string[]) || [],
    reportedToBoard: Boolean(data.reportedToBoard),
    reportedToUsers: Boolean(data.reportedToUsers),
    status: data.status as BreachRecord["status"],
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  } as BreachRecord;
}

/**
 * Get all breaches (for DPO dashboard)
 */
export async function getAllBreaches(
  status?: string,
  limit = 100
): Promise<BreachRecord[]> {
  let query = adminDb.collection("dataBreaches").orderBy("createdAt", "desc");

  if (status) {
    query = query.where("status", "==", status);
  }

  const snapshot = await query.limit(limit).get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      severity: data.severity as BreachRecord["severity"],
      description: data.description as string,
      affectedCategories: (data.affectedCategories as string[]) || [],
      estimatedAffectedUsers: Number(data.estimatedAffectedUsers) || 0,
      discoveredAt: data.discoveredAt?.toDate?.() || new Date(),
      containedAt: (data.containedAt as Date) || null,
      rootCause: (data.rootCause as string) || null,
      remediationSteps: (data.remediationSteps as string[]) || [],
      reportedToBoard: Boolean(data.reportedToBoard),
      reportedToUsers: Boolean(data.reportedToUsers),
      status: data.status as BreachRecord["status"],
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
    } as BreachRecord;
  }) as BreachRecord[];
}

/**
 * Get open/critical breaches (for DPO alerting)
 */
export async function getActiveBreaches(): Promise<BreachRecord[]> {
  const snapshot = await adminDb
    .collection("dataBreaches")
    .where("status", "in", ["open", "contained"])
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      severity: data.severity as BreachRecord["severity"],
      description: data.description as string,
      affectedCategories: (data.affectedCategories as string[]) || [],
      estimatedAffectedUsers: Number(data.estimatedAffectedUsers) || 0,
      discoveredAt: data.discoveredAt?.toDate?.() || new Date(),
      containedAt: (data.containedAt as Date) || null,
      rootCause: (data.rootCause as string) || null,
      remediationSteps: (data.remediationSteps as string[]) || [],
      reportedToBoard: Boolean(data.reportedToBoard),
      reportedToUsers: Boolean(data.reportedToUsers),
      status: data.status as BreachRecord["status"],
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
    } as BreachRecord;
  }) as BreachRecord[];
}
