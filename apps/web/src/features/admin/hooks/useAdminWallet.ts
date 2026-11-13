/**
 * @fileoverview Admin wallet hook — data loading and business logic.
 *
 * Encapsulates customer loading, refund request handling, and credit
 * authorization so the page stays a thin composition root.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { customerApi } from "@/lib/customerApiClient";
import { getCustomersWithWallets, getRefundRequestDetails, type AdminCustomer } from "@/features/admin/services/customers";

export interface AdminWalletState {
  customers: AdminCustomer[];
  loading: boolean;
  search: string;
  selectedCustomer: AdminCustomer | null;
  amount: string;
  description: string;
  adding: boolean;
  successMessage: string;
  errorMessage: string;
  refundMode: boolean;
  refundLoading: boolean;
  refundRequestId: string | null;
}

export interface AdminWalletActions {
  setSearch: (value: string) => void;
  setSelectedCustomer: (customer: AdminCustomer | null) => void;
  setAmount: (value: string) => void;
  setDescription: (value: string) => void;
  handleAddCredits: () => Promise<void>;
  clearMessages: () => void;
}

export function useAdminWallet(): AdminWalletState & AdminWalletActions {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refundRequestId = searchParams.get("refundRequest");

  const [refundMode, setRefundMode] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<AdminCustomer | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Load customers on mount
  useEffect(() => {
    async function loadCustomers() {
      try {
        setLoading(true);
        const customerData = await getCustomersWithWallets();
        setCustomers(customerData);
      } catch (error) {
        console.error("[AdminWallet] Failed to load customers:", error);
        setErrorMessage("Unable to load customers.");
      } finally {
        setLoading(false);
      }
    }
    loadCustomers();
  }, []);

  // Auto-load refund request when ?refundRequest= is present
  const [prevRefundRequestId, setPrevRefundRequestId] = useState<string | null>(null);
  if (refundRequestId !== prevRefundRequestId) {
    setPrevRefundRequestId(refundRequestId);
    if (!refundRequestId) {
      setRefundMode(false);
    }
  }

  useEffect(() => {
    if (!refundRequestId) return;
    async function loadRefundRequest() {
      try {
        setRefundLoading(true);
        setErrorMessage("");
        const refund = await getRefundRequestDetails(refundRequestId!);
        setRefundMode(true);

        const customer = customers.find((item) => item.id === refund.userId);
        if (customer) {
          setSelectedCustomer(customer);
        }
        setAmount(String(refund.walletRefundAmount));
      } catch (error) {
        console.error("[AdminWallet] Failed to load refund request:", error);
        setErrorMessage("Failed to load refund request details.");
      } finally {
        setRefundLoading(false);
      }
    }
    loadRefundRequest();
     
  }, [refundRequestId, customers]);

  const handleAddCredits = useCallback(async () => {
    if (!selectedCustomer) {
      toast.warning("Select a customer first.");
      return;
    }

    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast.warning("Enter a valid amount.");
      return;
    }

    setAdding(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await customerApi<{ success: boolean }>(
        "/api/admin/wallet/credit",
        {
          method: "POST",
          body: {
            userId: selectedCustomer.id,
            amount: numericAmount,
            description: description.trim() || (refundMode ? "Refund" : "Admin credit"),
          },
        }
      );

      if (response.success) {
        setSuccessMessage(
          refundMode
            ? `Refund of $${numericAmount.toFixed(2)} authorized.`
            : `$${numericAmount.toFixed(2)} credited to ${selectedCustomer.displayName}.`
        );
        setAmount("");
        setDescription("");
        // Refresh customer list to show updated balance
        const updated = await getCustomersWithWallets();
        setCustomers(updated);
        if (refundRequestId) {
          router.replace("/admin/wallet");
        }
      } else {
        setErrorMessage("Operation failed. Please try again.");
      }
    } catch (error) {
      console.error("[AdminWallet] Failed to add credits:", error);
      setErrorMessage("Could not complete the transaction.");
    } finally {
      setAdding(false);
    }
  }, [selectedCustomer, amount, description, refundMode, refundRequestId, router]);

  const clearMessages = useCallback(() => {
    setSuccessMessage("");
    setErrorMessage("");
  }, []);

  return {
    customers,
    loading,
    search,
    selectedCustomer,
    amount,
    description,
    adding,
    successMessage,
    errorMessage,
    refundMode,
    refundLoading,
    refundRequestId,
    setSearch,
    setSelectedCustomer,
    setAmount,
    setDescription,
    handleAddCredits,
    clearMessages,
  };
}