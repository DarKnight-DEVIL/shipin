"use client";

import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";
import { useHydrated } from "@/hooks/useHydrated";

const AccountSection = dynamic(
  () => import("@/components/settings/AccountSection").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const AppearanceSection = dynamic(
  () => import("@/components/settings/AppearanceSection").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const DashboardMetricsSection = dynamic(
  () => import("@/components/settings/DashboardMetricsSection").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const NotificationsSettings = dynamic(
  () => import("@/components/settings/NotificationsSettings").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

const SecuritySection = dynamic(
  () => import("@/components/settings/SecuritySection").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900" /> }
);

import { useTheme } from "next-themes";
import { usePasswordSettings } from "@/features/auth/hooks/usePasswordSettings";
import { useNotificationSettings } from "@/features/notifications/hooks/useNotificationSettings";
import { useDashboardMetricSettings } from "@/features/users/hooks/useDashboardMetricSettings";
import { useProfileSettings } from "@/features/users/hooks/useProfileSettings";

const SECTIONS = [
  ["account", "Account"],
  ["security", "Security"],
  ["appearance", "Appearance"],
  ["dashboard", "Dashboard"],
  ["channels", "Notifications"],
] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const profileSettings = useProfileSettings();
  const passwordSettings = usePasswordSettings(
    profileSettings.hasPasswordProvider
  );
  const dashboardSettings = useDashboardMetricSettings();
  const notificationSettings = useNotificationSettings();

  if (!hydrated) return null;

  return (
    <div className="app-page">
      <PageHeader
        title="Settings"
        subtitle="Account, security and preferences"
      />

      <div className="grid gap-8 lg:grid-cols-[152px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-6 space-y-px">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="flex h-8 items-center rounded-md px-2.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 max-w-[760px] space-y-4">
          <AccountSection settings={profileSettings} />

          <SecuritySection
            settings={passwordSettings}
            hasPasswordProvider={profileSettings.hasPasswordProvider}
            hasGoogleProvider={profileSettings.hasGoogleProvider}
          />

          <AppearanceSection theme={theme} setTheme={setTheme} />

          <DashboardMetricsSection settings={dashboardSettings} />

          <NotificationsSettings settings={notificationSettings} />
        </div>
      </div>
    </div>
  );
}
