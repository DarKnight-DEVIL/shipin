import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import {
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
  dashboardMetrics,
  type DashboardMetricId,
} from "@/lib/dashboardMetrics";

export interface UserPreferences {
  dashboardMetrics: DashboardMetricId[];
}

const validMetricIds = new Set(
  dashboardMetrics.map((metric) => metric.id)
);

export async function getUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const userRef = doc(db, "users", userId);

  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return {
      dashboardMetrics: DEFAULT_DASHBOARD_METRICS,
    };
  }

  const data = snapshot.data();

  const savedMetrics =
    data.preferences?.dashboardMetrics;

  /*
   * Validate Firestore data before using it.
   * This protects the dashboard if an old or
   * invalid metric ID exists in Firestore.
   */
  if (Array.isArray(savedMetrics)) {
    const validSavedMetrics =
      savedMetrics.filter(
        (metric): metric is DashboardMetricId =>
          typeof metric === "string" &&
          validMetricIds.has(
            metric as DashboardMetricId
          )
      );

    if (
      validSavedMetrics.length >=
      MIN_DASHBOARD_METRICS
    ) {
      return {
        dashboardMetrics:
          validSavedMetrics,
      };
    }
  }

  return {
    dashboardMetrics:
      DEFAULT_DASHBOARD_METRICS,
  };
}

export async function saveDashboardMetrics(
  userId: string,
  metrics: DashboardMetricId[]
) {
  if (
    metrics.length <
    MIN_DASHBOARD_METRICS
  ) {
    throw new Error(
      `Select at least ${MIN_DASHBOARD_METRICS} dashboard cards.`
    );
  }

  const validMetrics =
    metrics.filter(
      (metric) =>
        validMetricIds.has(metric)
    );

  if (
    validMetrics.length !==
    metrics.length
  ) {
    throw new Error(
      "One or more dashboard metrics are invalid."
    );
  }

  const userRef = doc(
    db,
    "users",
    userId
  );

  /*
   * merge:true is important.
   *
   * We don't want dashboard preferences
   * overwriting the customer's existing
   * user document.
   */
  await setDoc(
    userRef,
    {
      preferences: {
        dashboardMetrics:
          validMetrics,
      },

      preferencesUpdatedAt:
        serverTimestamp(),
    },
    {
      merge: true,
    }
  );
}