import { Check, RotateCcw } from "lucide-react";

import type { useDashboardMetricSettings } from "@/features/users/hooks/useDashboardMetricSettings";
import {
  MIN_DASHBOARD_METRICS,
  dashboardMetrics,
} from "@/features/users/services/dashboardMetrics";
import SettingsSection from "./SettingsSection";
import { GhostButton, PrimaryButton } from "./SettingsButtons";

interface DashboardMetricsSectionProps {
  settings: ReturnType<typeof useDashboardMetricSettings>;
}

export default function DashboardMetricsSection({
  settings,
}: DashboardMetricsSectionProps) {
  const { selectedMetrics, loading, saving, saved, toggle, reset, save } =
    settings;

  return (
    <SettingsSection
      id="dashboard"
      title="Dashboard"
      description={`Choose at least ${MIN_DASHBOARD_METRICS} metrics to show`}
    >
      {loading ? (
        <div className="h-20 animate-pulse rounded-lg bg-[var(--surface-3)]" />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {dashboardMetrics.map((metric) => {
              const selected = selectedMetrics.includes(metric.id);
              return (
                <button
                  key={metric.id}
                  type="button"
                  onClick={() => toggle(metric.id)}
                  data-active={selected}
                  aria-pressed={selected}
                  className="app-chip"
                >
                  {selected && <Check size={11} strokeWidth={3} />}
                  {metric.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <GhostButton type="button" onClick={reset}>
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw size={14} />
                Reset defaults
              </span>
            </GhostButton>
            <PrimaryButton type="button" disabled={saving} onClick={save}>
              {saving ? "Saving…" : saved ? "Saved" : "Save"}
            </PrimaryButton>
          </div>
        </>
      )}
    </SettingsSection>
  );
}
