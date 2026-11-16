// No direct Firestore imports needed - using customerApi client

import { customerApi } from "@/lib/customerApiClient";
import { toShipINError } from "@/utils/errors";

export interface AdminCustomer {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role?: string;
  walletBalance: number;
}

export type AdminCustomerFilter = string | null;

export interface RefundRequestDetails {
  id: string;
  userId: string;
  preference: string;
  totalRefundAmount: number;
  walletRefundAmount: number;
}

interface RefundRequestData {
  refundRequest?: {
    preference?: string;
    amount?: number;
    walletAmount?: number;
  };
  preference?: string;
  amount?: number;
  walletAmount?: number;
  payment?: { walletAmount?: number };
  id?: string;
  userId?: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function fetchCustomers(): Promise<AdminCustomer[]> {
  const result = await customerApi<{ success: boolean; customers: AdminCustomer[] }>(
    "/api/admin/customers",
    { method: "GET" }
  );
  return result.customers;
}

async function fetchRefundData(requestId: string): Promise<RefundRequestData> {
  const result = await customerApi<{ success: boolean; data: RefundRequestData }>(
    `/api/admin/customers?requestId=${encodeURIComponent(requestId)}`,
    { method: "GET" }
  );
  return result.data;
}

// ─── public API ─────────────────────────────────────────────────────────────

export async function getCustomersWithWallets(): Promise<AdminCustomer[]> {
  try {
    return await fetchCustomers();
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getRefundRequestDetails(
  requestId: string
): Promise<RefundRequestDetails> {
  try {
    const data = await fetchRefundData(requestId);

    const preference =
      (data.refundRequest?.preference ?? data.preference ?? "wallet") as string;
    const totalRefundAmount = Number(data.refundRequest?.amount ?? data.amount ?? 0);
    const originalWalletAmount = Number(
      (data.refundRequest?.walletAmount ??
        data.payment?.walletAmount ??
        data.walletAmount ??
        0) as number
    );

    const walletRefundAmount =
      preference === "wallet"
        ? totalRefundAmount
        : ["original_sources", "original_payment"].includes(preference)
          ? originalWalletAmount
          : 0;

    if (!Number.isFinite(walletRefundAmount) || walletRefundAmount <= 0) {
      throw new Error("This refund does not contain a wallet refund amount.");
    }

    return {
      id: String(data.id ?? requestId),
      userId: String(data.userId ?? ""),
      preference,
      totalRefundAmount,
      walletRefundAmount,
    };
  } catch (error) {
    throw toShipINError(error);
  }
}
