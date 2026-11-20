import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export interface AdminRequestData {
  id: string;
  userId: string;
  customerName: string;
  email: string;
  status: string;
  createdAt?: { seconds: number; nanoseconds: number };
  updatedAt?: { seconds: number; nanoseconds: number };
}

async function handleGetRequests(request: NextRequest): Promise<NextResponse> {
  await requireAdmin(request);

  const snapshot = await adminDb.collection("requests").get();

  // Serialize Firestore Timestamps to plain objects for JSON transport
  const serializeTimestamp = (
    val: unknown
  ): { seconds: number; nanoseconds: number } | undefined => {
    if (!val || typeof val !== "object") return undefined;
    const ts = val as { seconds?: number; nanoseconds?: number };
    if (typeof ts.seconds === "number") {
      return { seconds: ts.seconds, nanoseconds: ts.nanoseconds ?? 0 };
    }
    return undefined;
  };

  const requests: AdminRequestData[] = snapshot.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      userId: String(d.userId || ""),
      customerName: String(d.customerName || ""),
      email: String(d.email || ""),
      status: String(d.status || ""),
      createdAt: serializeTimestamp(d.createdAt),
      updatedAt: serializeTimestamp(d.updatedAt),
    };
  });

  return NextResponse.json(
    { success: true, requests },
    { status: 200, headers: NO_STORE }
  );
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    return await handleGetRequests(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    if (authError.status !== 500) {
      return NextResponse.json(
        { success: false, error: authError.error },
        { status: authError.status, headers: NO_STORE }
      );
    }
    console.error("[AdminRequests] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to load requests." },
      { status: 500, headers: NO_STORE }
    );
  }
};
