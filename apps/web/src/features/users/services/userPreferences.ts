import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebaseDb";
import { customerApi } from "@/lib/customerApiClient";
import { toShipINError, ValidationError } from "@/utils/errors";

import {
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
  dashboardMetrics,
  type DashboardMetricId,
} from "@/features/users/services/dashboardMetrics";

export interface UserPreferences {
  dashboardMetrics: DashboardMetricId[];
}

const validMetricIds = new Set(
  dashboardMetrics.map((metric) => metric.id)
);

export async function getUserPreferences(
  userId: string
): Promise<UserPreferences> {
  try {
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
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function saveDashboardMetrics(
  userId: string,
  metrics: DashboardMetricId[]
) {
  try {
    void userId;

    if (
      metrics.length <
      MIN_DASHBOARD_METRICS
    ) {
      throw new ValidationError(
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
      throw new ValidationError(
        "One or more dashboard metrics are invalid."
      );
    }

    await customerApi<{ success: boolean }>("/api/profile/preferences", {
      method: "PATCH",
      body: {
        metrics: validMetrics,
      },
    });
  } catch (error) {
    throw toShipINError(error);
  }
}
