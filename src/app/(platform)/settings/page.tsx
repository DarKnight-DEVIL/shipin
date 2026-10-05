"use client";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  RotateCcw,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import {
  getUserProfile,
  createUserProfile,
  updateUserProfile,
} from "@/lib/userProfile";
import {
  dashboardMetrics,
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
  type DashboardMetricId,
} from "@/lib/dashboardMetrics";
import {
  getUserPreferences,
  saveDashboardMetrics,
} from "@/lib/userPreferences";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type NotificationCategoryPreferences,
} from "@/types/notificationPreferences";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/firestore";

type ThemeOption = "light" | "dark" | "system";

const WHATSAPP_COUNTRIES = [
  ["🇮🇳", "India", "+91"],
  ["🇺🇸", "United States", "+1"],
  ["🇨🇦", "Canada", "+1"],
  ["🇬🇧", "United Kingdom", "+44"],
  ["🇦🇪", "United Arab Emirates", "+971"],
  ["🇦🇺", "Australia", "+61"],
  ["🇸🇬", "Singapore", "+65"],
  ["🇩🇪", "Germany", "+49"],
  ["🇫🇷", "France", "+33"],
  ["🇮🇹", "Italy", "+39"],
  ["🇪🇸", "Spain", "+34"],
  ["🇳🇱", "Netherlands", "+31"],
  ["🇨🇭", "Switzerland", "+41"],
  ["🇸🇦", "Saudi Arabia", "+966"],
  ["🇶🇦", "Qatar", "+974"],
  ["🇰🇼", "Kuwait", "+965"],
  ["🇴🇲", "Oman", "+968"],
  ["🇧🇭", "Bahrain", "+973"],
  ["🇧🇩", "Bangladesh", "+880"],
  ["🇵🇰", "Pakistan", "+92"],
  ["🇱🇰", "Sri Lanka", "+94"],
  ["🇳🇵", "Nepal", "+977"],
  ["🇲🇾", "Malaysia", "+60"],
  ["🇮🇩", "Indonesia", "+62"],
  ["🇵🇭", "Philippines", "+63"],
  ["🇹🇭", "Thailand", "+66"],
  ["🇻🇳", "Vietnam", "+84"],
  ["🇯🇵", "Japan", "+81"],
  ["🇰🇷", "South Korea", "+82"],
  ["🇨🇳", "China", "+86"],
  ["🇭🇰", "Hong Kong", "+852"],
  ["🇳🇿", "New Zealand", "+64"],
  ["🇿🇦", "South Africa", "+27"],
  ["🇳🇬", "Nigeria", "+234"],
  ["🇰🇪", "Kenya", "+254"],
  ["🇪🇬", "Egypt", "+20"],
  ["🇧🇷", "Brazil", "+55"],
  ["🇲🇽", "Mexico", "+52"],
  ["🇦🇷", "Argentina", "+54"],
  ["🇹🇷", "Turkey", "+90"],
] as const;

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-white/10 dark:disabled:bg-slate-900 dark:disabled:text-slate-500";

const labelClass =
  "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Profile
  const [profile, setProfile] = useState({
    displayName: "",
    email: "",
    phone: "",
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Security
  const [hasPasswordProvider, setHasPasswordProvider] = useState(false);
  const [hasGoogleProvider, setHasGoogleProvider] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Dashboard metrics
  const [selectedDashboardMetrics, setSelectedDashboardMetrics] =
    useState<DashboardMetricId[]>(DEFAULT_DASHBOARD_METRICS);
  const [dashboardSettingsLoading, setDashboardSettingsLoading] =
    useState(true);
  const [dashboardSettingsSaving, setDashboardSettingsSaving] =
    useState(false);
  const [dashboardSaved, setDashboardSaved] = useState(false);

  // Notifications
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationSettingsLoading, setNotificationSettingsLoading] =
    useState(true);
  const [notificationChannelsSaving, setNotificationChannelsSaving] =
    useState(false);
  const [notificationTypesSaving, setNotificationTypesSaving] =
    useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappCountryCode, setWhatsappCountryCode] = useState("+91");
  const [whatsappLocalNumber, setWhatsappLocalNumber] = useState("");
  const [whatsappCountrySearch, setWhatsappCountrySearch] = useState("");
  const [whatsappCountryOpen, setWhatsappCountryOpen] = useState(false);
  const [whatsappConsentChecked, setWhatsappConsentChecked] = useState(false);
  const [whatsappEditing, setWhatsappEditing] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setProfileLoading(false);
        return;
      }

      const providers = user.providerData.map((p) => p.providerId);
      setHasPasswordProvider(providers.includes("password"));
      setHasGoogleProvider(providers.includes("google.com"));

      try {
        let savedProfile = await getUserProfile(user.uid);

        if (!savedProfile || !savedProfile.email || !savedProfile.photoURL) {
          await createUserProfile(user.uid, {
            displayName:
              savedProfile?.displayName || user.displayName || "",
            email: user.email || savedProfile?.email || "",
            phone: savedProfile?.phone || user.phoneNumber || "",
            photoURL: savedProfile?.photoURL || user.photoURL || "",
          });
          savedProfile = await getUserProfile(user.uid);
        }

        if (user.photoURL && savedProfile?.photoURL !== user.photoURL) {
          await updateUserProfile(user.uid, { photoURL: user.photoURL });
          savedProfile = await getUserProfile(user.uid);
        }

        setProfile({
          displayName:
            savedProfile?.displayName || user.displayName || "",
          email: user.email ?? "",
          phone: savedProfile?.phone ?? "",
        });
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setProfileLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setDashboardSettingsLoading(false);
        return;
      }
      try {
        const preferences = await getUserPreferences(user.uid);
        setSelectedDashboardMetrics(preferences.dashboardMetrics);
      } catch (error) {
        console.error("Failed to load dashboard preferences:", error);
      } finally {
        setDashboardSettingsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setNotificationSettingsLoading(false);
        return;
      }
      try {
        const preferences = await getNotificationPreferences(user.uid);
        setNotificationPreferences(preferences);
        const savedPhone = preferences.whatsapp.phone?.trim() ?? "";
        const match = [...WHATSAPP_COUNTRIES]
          .sort((a, b) => b[2].length - a[2].length)
          .find((c) => savedPhone.startsWith(c[2]));
        if (match) {
          setWhatsappCountryCode(match[2]);
          setWhatsappLocalNumber(
            savedPhone.slice(match[2].length).replace(/\D/g, "")
          );
        }
        setWhatsappConsentChecked(Boolean(preferences.whatsapp.consentedAt));
        setWhatsappEditing(
          !(savedPhone && preferences.whatsapp.consentedAt)
        );
      } catch (error) {
        console.error("Failed to load notification preferences:", error);
      } finally {
        setNotificationSettingsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  function toggleDashboardMetric(metricId: DashboardMetricId) {
    setDashboardSaved(false);
    setSelectedDashboardMetrics((current) => {
      const selected = current.includes(metricId);
      if (selected) {
        if (current.length <= MIN_DASHBOARD_METRICS) return current;
        return current.filter((id) => id !== metricId);
      }
      return [...current, metricId];
    });
  }

  async function handleSaveProfile() {
    const user = auth.currentUser;
    if (!user) {
      toast.warning("Please sign in first.");
      return;
    }
    const displayName = profile.displayName.trim();
    const phone = profile.phone.trim();
    if (!displayName) {
      toast.warning("Please enter your name.");
      return;
    }
    try {
      setProfileSaving(true);
      await updateUserProfile(user.uid, { displayName, phone });
      await updateProfile(user, { displayName });
      setProfile((c) => ({ ...c, displayName, phone }));
      setEditingProfile(false);
      toast.success("Profile updated");
    } catch (error) {
      console.error(error);
      toast.error("Couldn't update profile");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError("New password must be different.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }

    const user = auth.currentUser;
    if (!user?.email) {
      setPasswordError("No authenticated user found.");
      return;
    }

    try {
      setChangingPassword(true);
      if (hasPasswordProvider) {
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword
        );
        await reauthenticateWithCredential(user, credential);
      }
      await updatePassword(user, newPassword);
      setPasswordMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error(error);
      setPasswordError(error.message || "Failed to update password.");
    } finally {
      setChangingPassword(false);
    }
  }

  function toggleNotificationChannel(
    channel: keyof NotificationPreferences["channels"]
  ) {
    setNotificationPreferences((c) => ({
      ...c,
      channels: { ...c.channels, [channel]: !c.channels[channel] },
    }));
  }

  function toggleNotificationCategory(
    category: keyof NotificationCategoryPreferences
  ) {
    setNotificationPreferences((c) => ({
      ...c,
      categories: { ...c.categories, [category]: !c.categories[category] },
    }));
  }

  async function saveNotifications(
    saveTarget: "channels" | "types" | "whatsapp"
  ) {
    const user = auth.currentUser;
    if (!user) {
      toast.warning("Please sign in first.");
      return;
    }

    let phone = notificationPreferences.whatsapp.phone.trim();

    if (notificationPreferences.channels.whatsapp) {
      const local = whatsappLocalNumber.replace(/\D/g, "");
      phone = `${whatsappCountryCode}${local}`;
      if (
        !local ||
        phone.replace(/\D/g, "").length < 8 ||
        phone.replace(/\D/g, "").length > 15
      ) {
        toast.warning("Enter a valid WhatsApp number.");
        return;
      }
      if (!whatsappConsentChecked) {
        toast.warning(
          "Confirm consent to receive transactional WhatsApp updates."
        );
        return;
      }
    }

    try {
      if (saveTarget === "channels") setNotificationChannelsSaving(true);
      if (saveTarget === "types") setNotificationTypesSaving(true);
      if (saveTarget === "whatsapp") setWhatsappSaving(true);

      const preferencesToSave: NotificationPreferences =
        notificationPreferences.channels.whatsapp
          ? {
              ...notificationPreferences,
              whatsapp: {
                ...notificationPreferences.whatsapp,
                phone,
                consentedAt:
                  notificationPreferences.whatsapp.consentedAt ??
                  new Date().toISOString(),
              },
            }
          : {
              ...notificationPreferences,
              whatsapp: {
                ...notificationPreferences.whatsapp,
                consentedAt: undefined,
              },
            };

      await saveNotificationPreferences(user.uid, preferencesToSave);
      setNotificationPreferences(preferencesToSave);

      if (saveTarget === "whatsapp") {
        setWhatsappEditing(false);
        setWhatsappCountryOpen(false);
        toast.success("WhatsApp settings saved");
      } else if (saveTarget === "channels") {
        toast.success("Channels saved");
      } else {
        toast.success("Notification types saved");
      }
    } catch (error) {
      console.error(error);
      toast.error("Couldn't save preferences");
    } finally {
      if (saveTarget === "channels") setNotificationChannelsSaving(false);
      if (saveTarget === "types") setNotificationTypesSaving(false);
      if (saveTarget === "whatsapp") setWhatsappSaving(false);
    }
  }

  async function handleSaveDashboardSettings() {
    const user = auth.currentUser;
    if (!user) {
      toast.warning("Please sign in first.");
      return;
    }
    try {
      setDashboardSettingsSaving(true);
      setDashboardSaved(false);
      await saveDashboardMetrics(user.uid, selectedDashboardMetrics);
      setDashboardSaved(true);
      toast.success("Dashboard updated");
    } catch (error) {
      console.error(error);
      toast.error("Couldn't save dashboard settings");
    } finally {
      setDashboardSettingsSaving(false);
    }
  }

  if (!mounted) return null;

  const themeOptions: { id: ThemeOption; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ];

  const filteredCountries = WHATSAPP_COUNTRIES.filter((c) => {
    const q = whatsappCountrySearch.trim().toLowerCase();
    if (!q) return true;
    return c[1].toLowerCase().includes(q) || c[2].includes(q);
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Account, security, and preferences
        </p>
      </div>

      <div className="space-y-5">
        {/* Account */}
        <Section title="Account" description="Your name and contact details">
          {profileLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
          ) : (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  value={profile.displayName}
                  disabled={!editingProfile}
                  onChange={(e) =>
                    setProfile((c) => ({ ...c, displayName: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input value={profile.email} disabled className={inputClass} />
                <p className="mt-1 text-xs text-slate-400">
                  Login email can’t be changed here
                </p>
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  type="tel"
                  value={profile.phone}
                  disabled={!editingProfile}
                  onChange={(e) =>
                    setProfile((c) => ({ ...c, phone: e.target.value }))
                  }
                  placeholder="+91 98765 43210"
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                {editingProfile ? (
                  <>
                    <GhostButton
                      type="button"
                      disabled={profileSaving}
                      onClick={() => setEditingProfile(false)}
                    >
                      Cancel
                    </GhostButton>
                    <PrimaryButton
                      type="button"
                      disabled={profileSaving}
                      onClick={handleSaveProfile}
                    >
                      {profileSaving ? "Saving…" : "Save"}
                    </PrimaryButton>
                  </>
                ) : (
                  <GhostButton
                    type="button"
                    onClick={() => setEditingProfile(true)}
                  >
                    Edit
                  </GhostButton>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* Security */}
        <Section title="Security" description="Password and sign-in methods">
          <div className="mb-4 flex flex-wrap gap-2">
            {hasPasswordProvider && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Email & password
              </span>
            )}
            {hasGoogleProvider && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Google
              </span>
            )}
          </div>

          {hasPasswordProvider ? (
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className={labelClass}>Current password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                  autoComplete="current-password"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className={labelClass}>Confirm new</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              {passwordError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {passwordError}
                </p>
              )}
              {passwordMessage && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  {passwordMessage}
                </p>
              )}
              <div className="flex justify-end">
                <PrimaryButton type="submit" disabled={changingPassword}>
                  {changingPassword ? "Updating…" : "Update password"}
                </PrimaryButton>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              You sign in with Google. Password changes aren’t available for
              this account.
            </p>
          )}
        </Section>

        {/* Appearance — theme only, no language */}
        <Section title="Appearance" description="Color theme">
          <div className="flex flex-wrap gap-2">
            {themeOptions.map((opt) => {
              const active = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Dashboard */}
        <Section
          title="Dashboard"
          description={`Choose at least ${MIN_DASHBOARD_METRICS} metrics to show`}
        >
          {dashboardSettingsLoading ? (
            <div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {dashboardMetrics.map((metric) => {
                  const selected = selectedDashboardMetrics.includes(metric.id);
                  return (
                    <button
                      key={metric.id}
                      type="button"
                      onClick={() => toggleDashboardMetric(metric.id)}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        selected
                          ? "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800"
                          : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selected
                            ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                            : "border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        {selected && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {metric.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <GhostButton
                  type="button"
                  onClick={() => {
                    setSelectedDashboardMetrics(DEFAULT_DASHBOARD_METRICS);
                    setDashboardSaved(false);
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw size={14} />
                    Reset defaults
                  </span>
                </GhostButton>
                <PrimaryButton
                  type="button"
                  disabled={dashboardSettingsSaving}
                  onClick={handleSaveDashboardSettings}
                >
                  {dashboardSettingsSaving
                    ? "Saving…"
                    : dashboardSaved
                      ? "Saved"
                      : "Save"}
                </PrimaryButton>
              </div>
            </>
          )}
        </Section>

        {/* Notification channels */}
        <Section
          title="Notification channels"
          description="Where we can reach you"
        >
          {notificationSettingsLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
          ) : (
            <>
              <div className="space-y-2">
                {(
                  [
                    { key: "inApp" as const, label: "In-app" },
                    { key: "email" as const, label: "Email" },
                    { key: "whatsapp" as const, label: "WhatsApp" },
                  ] as const
                ).map((ch) => (
                  <label
                    key={ch.key}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {ch.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={notificationPreferences.channels[ch.key]}
                      onChange={() => toggleNotificationChannel(ch.key)}
                      className="h-4 w-4 accent-slate-900 dark:accent-white"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <PrimaryButton
                  type="button"
                  disabled={notificationChannelsSaving}
                  onClick={() => saveNotifications("channels")}
                >
                  {notificationChannelsSaving ? "Saving…" : "Save channels"}
                </PrimaryButton>
              </div>
            </>
          )}
        </Section>

        {/* WhatsApp number — only when channel on */}
        {notificationPreferences.channels.whatsapp && (
          <Section
            title="WhatsApp number"
            description="Transactional updates only"
          >
            {whatsappEditing ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setWhatsappCountryOpen((v) => !v)
                      }
                      className="flex h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                    >
                      <span>
                        {WHATSAPP_COUNTRIES.find(
                          (c) => c[2] === whatsappCountryCode
                        )?.[0] ?? "🌐"}
                      </span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-300">
                        {whatsappCountryCode}
                      </span>
                      <ChevronDown size={14} className="text-slate-400" />
                    </button>
                    {whatsappCountryOpen && (
                      <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        <div className="border-b border-slate-100 p-2 dark:border-slate-800">
                          <input
                            value={whatsappCountrySearch}
                            onChange={(e) =>
                              setWhatsappCountrySearch(e.target.value)
                            }
                            placeholder="Search…"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-950"
                          />
                        </div>
                        <ul className="max-h-48 overflow-y-auto py-1">
                          {filteredCountries.map((c) => (
                            <li key={`${c[1]}-${c[2]}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  setWhatsappCountryCode(c[2]);
                                  setWhatsappCountryOpen(false);
                                  setWhatsappCountrySearch("");
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <span>{c[0]}</span>
                                <span className="flex-1 truncate">{c[1]}</span>
                                <span className="text-xs text-slate-400">
                                  {c[2]}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <input
                    value={whatsappLocalNumber}
                    onChange={(e) =>
                      setWhatsappLocalNumber(
                        e.target.value.replace(/\D/g, "")
                      )
                    }
                    placeholder="Phone number"
                    className={`${inputClass} flex-1`}
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={whatsappConsentChecked}
                    onChange={(e) =>
                      setWhatsappConsentChecked(e.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-slate-900 dark:accent-white"
                  />
                  I agree to receive transactional WhatsApp updates from ShipIN
                </label>
                <div className="flex justify-end">
                  <PrimaryButton
                    type="button"
                    disabled={whatsappSaving}
                    onClick={() => saveNotifications("whatsapp")}
                  >
                    {whatsappSaving ? "Saving…" : "Save number"}
                  </PrimaryButton>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm tabular-nums text-slate-800 dark:text-slate-200">
                  {whatsappCountryCode}
                  {whatsappLocalNumber}
                </p>
                <GhostButton
                  type="button"
                  onClick={() => setWhatsappEditing(true)}
                >
                  Change
                </GhostButton>
              </div>
            )}
          </Section>
        )}

        {/* Notification types */}
        <Section
          title="Notification types"
          description="What you want to hear about"
        >
          {notificationSettingsLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
          ) : (
            <>
              <div className="space-y-2">
                {(
                  Object.entries(notificationPreferences.categories) as [
                    keyof NotificationCategoryPreferences,
                    boolean,
                  ][]
                ).map(([key, enabled]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
                  >
                    <span className="text-sm font-medium capitalize text-slate-800 dark:text-slate-200">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleNotificationCategory(key)}
                      className="h-4 w-4 accent-slate-900 dark:accent-white"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <PrimaryButton
                  type="button"
                  disabled={notificationTypesSaving}
                  onClick={() => saveNotifications("types")}
                >
                  {notificationTypesSaving ? "Saving…" : "Save types"}
                </PrimaryButton>
              </div>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}