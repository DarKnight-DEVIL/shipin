"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import {
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
  type DashboardMetricId,
} from "@/features/users/services/dashboardMetrics";
import {
  getUserPreferences,
  saveDashboardMetrics,
} from "@/features/users/services/userPreferences";

export function useDashboardMetricSettings() {
  const [selectedMetrics, setSelectedMetrics] = useState<DashboardMetricId[]>(
    DEFAULT_DASHBOARD_METRICS
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const preferences = await getUserPreferences(user.uid);
        setSelectedMetrics(preferences.dashboardMetrics);
      } catch (error) {
        console.error("Failed to load dashboard preferences:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  function toggle(metricId: DashboardMetricId) {
    setSaved(false);
    setSelectedMetrics((current) => {
      const selected = current.includes(metricId);
      if (selected) {
        if (current.length <= MIN_DASHBOARD_METRICS) return current;
        return current.filter((id) => id !== metricId);
      }
      return [...current, metricId];
    });
  }

  function reset() {
    setSelectedMetrics(DEFAULT_DASHBOARD_METRICS);
    setSaved(false);
  }

  async function save() {
    const user = auth.currentUser;
    if (!user) {
      toast.warning("Please sign in first.");
      return;
    }

    try {
      setSaving(true);
      setSaved(false);
      await saveDashboardMetrics(user.uid, selectedMetrics);
      setSaved(true);
      toast.success("Dashboard updated");
    } catch (error) {
      console.error(error);
      toast.error("Couldn't save dashboard settings");
    } finally {
      setSaving(false);
    }
  }

  return {
    selectedMetrics,
    loading,
    saving,
    saved,
    toggle,
    reset,
    save,
  };
}
