"use client";

import { useEffect, useMemo, useState } from "react";

import { auth } from "@/lib/firebase";
import { getRequests } from "@/features/requests/services/requests";
import type { Request } from "@/types/request";

import {
  ACTIVE_REQUEST_STATUSES,
  DEFAULT_DASHBOARD_METRICS,
  IN_TRANSIT_STATUSES,
  dashboardMetrics,
  type DashboardMetricId,
} from "@/features/users/services/dashboardMetrics";
import { getUserPreferences } from "@/features/users/services/userPreferences";

export interface DashboardOverview {
  requests: Request[];
  loading: boolean;
  userName: string;
  selectedMetrics: DashboardMetricId[];
  visibleMetrics: typeof dashboardMetrics;
  metricValues: Record<DashboardMetricId, number>;
  attentionRequired: Request[];
  recentRequests: Request[];
  latestShipment: Request | undefined;
}

/**
 * Loads the signed-in customer's requests and dashboard preferences, then
 * derives every value the dashboard renders. Keeping this out of the page
 * makes the route a composition root and the calculations unit-testable.
 */
export function useDashboardOverview(): DashboardOverview {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("there");
  const [selectedMetrics, setSelectedMetrics] = useState<DashboardMetricId[]>(
    DEFAULT_DASHBOARD_METRICS
  );

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setRequests([]);
        setLoading(false);
        return;
      }

      setUserName(
        user.displayName?.split(" ")[0] ||
          user.email?.split("@")[0] ||
          "there"
      );

      try {
        const [data, preferences] = await Promise.all([
          getRequests(user.uid),
          getUserPreferences(user.uid),
        ]);

        const sorted = [...data.requests].sort((a, b) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;
          return bTime - aTime;
        });

        setRequests(sorted);
        setSelectedMetrics(preferences.dashboardMetrics);
      } catch (error) {
        console.error("Dashboard request loading failed:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const metricValues = useMemo<Record<DashboardMetricId, number>>(
    () => ({
      active: requests.filter((r) =>
        ACTIVE_REQUEST_STATUSES.includes(r.status)
      ).length,
      submitted: requests.filter((r) => r.status === "submitted").length,
      quote_ready: requests.filter((r) => r.status === "review").length,
      awaiting_payment: requests.filter((r) => {
        const main = r.status === "awaiting_payment" && !r.payment;
        const extra =
          r.additionalItemRequests?.some(
            (i) => i.status === "awaiting_payment"
          ) ?? false;
        return main || extra;
      }).length,
      paid: requests.filter((r) => r.status === "paid").length,
      purchased: requests.filter((r) => r.status === "purchased").length,
      warehouse_received: requests.filter(
        (r) => r.status === "warehouse_received"
      ).length,
      ready_for_international_shipping: requests.filter(
        (r) => r.status === "ready_for_international_shipping"
      ).length,
      packed: requests.filter((r) => r.status === "packed").length,
      shipped: requests.filter((r) => r.status === "shipped").length,
      in_transit: requests.filter((r) =>
        IN_TRANSIT_STATUSES.includes(r.status)
      ).length,
      out_for_delivery: requests.filter(
        (r) => r.status === "out_for_delivery"
      ).length,
      delivered: requests.filter((r) => r.status === "delivered").length,
      refunded: requests.filter((r) => r.status === "refunded").length,
    }),
    [requests]
  );

  const visibleMetrics = useMemo(
    () =>
      selectedMetrics
        .map((id) => dashboardMetrics.find((m) => m.id === id))
        .filter((m): m is (typeof dashboardMetrics)[number] => Boolean(m)),
    [selectedMetrics]
  );

  const attentionRequired = useMemo(
    () =>
      requests.filter((r) => {
        const quoteReady = r.status === "review";
        const paymentRequired = r.status === "awaiting_payment" && !r.payment;
        const additionalPayment =
          r.additionalItemRequests?.some(
            (i) => i.status === "awaiting_payment"
          ) ?? false;
        return quoteReady || paymentRequired || additionalPayment;
      }),
    [requests]
  );

  return {
    requests,
    loading,
    userName,
    selectedMetrics,
    visibleMetrics,
    metricValues,
    attentionRequired,
    recentRequests: requests.slice(0, 5),
    latestShipment: requests.find((r) => r.tracking?.internalTrackingId),
  };
}
