/**
 * @fileoverview Admin audit hook — data loading and business logic.
 *
 * Encapsulates customer loading, request loading, customer search,
 * and request filtering so the page stays a thin composition root.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Request } from "@/types/request";
import { type AdminCustomer, getCustomersWithWallets } from "@/features/admin/services/customers";
import { getAllRequests } from "@/features/admin/services/requestQueue";

export interface AdminAuditState {
  customers: AdminCustomer[];
  requests: Request[];
  selectedCustomerId: string | null;
  search: string;
  loading: boolean;
  selectedCustomer: AdminCustomer | null;
  customerRequests: Request[];
  filteredCustomers: AdminCustomer[];
}

export interface AdminAuditActions {
  setSearch: (value: string) => void;
  setSelectedCustomerId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

export function useAdminAudit(): AdminAuditState & AdminAuditActions {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAuditData = useCallback(async () => {
    try {
      setLoading(true);
      const [customerList, requestList] = await Promise.all([
        getCustomersWithWallets(),
        getAllRequests(),
      ]);
      setCustomers(customerList);
      setRequests(requestList);
      if (customerList.length > 0) {
        setSelectedCustomerId(customerList[0].id);
      }
    } catch (error) {
      console.error("[AdminAudit] Failed to load audit data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const [customerList, requestList] = await Promise.all([
          getCustomersWithWallets(),
          getAllRequests(),
        ]);
        setCustomers(customerList);
        setRequests(requestList);
        if (customerList.length > 0) {
          setSelectedCustomerId(customerList[0].id);
        }
      } catch (error) {
        console.error("[AdminAudit] Failed to load audit data:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(
      (customer) =>
        customer.displayName.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.id.toLowerCase().includes(query)
    );
  }, [customers, search]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const customerRequests = useMemo(() => {
    if (!selectedCustomerId) return [];
    return requests
      .filter((request) => request.userId === selectedCustomerId)
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
  }, [requests, selectedCustomerId]);

  return {
    customers,
    requests,
    selectedCustomerId,
    search,
    loading,
    selectedCustomer,
    customerRequests,
    filteredCustomers,
    setSearch,
    setSelectedCustomerId,
    refresh: loadAuditData,
  };
}