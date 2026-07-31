"use client";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
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
import {
  Check,
  LayoutDashboard,
  RotateCcw,
  UserRound,
  Pencil,
  Save,
  X,
  ShieldCheck,
  Bell,
  Mail,
  MessageCircle,
  PackageCheck,
  CreditCard,
  Warehouse,
  Truck,
  CircleCheckBig,
  Headphones,
  ChevronDown,
} from "lucide-react";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

type ThemeOption = "light" | "dark" | "system";

const WHATSAPP_COUNTRIES = [
  ["🇮🇳","India","+91"],["🇺🇸","United States","+1"],["🇨🇦","Canada","+1"],
  ["🇬🇧","United Kingdom","+44"],["🇦🇪","United Arab Emirates","+971"],
  ["🇦🇺","Australia","+61"],["🇸🇬","Singapore","+65"],["🇩🇪","Germany","+49"],
  ["🇫🇷","France","+33"],["🇮🇹","Italy","+39"],["🇪🇸","Spain","+34"],
  ["🇳🇱","Netherlands","+31"],["🇨🇭","Switzerland","+41"],["🇸🇦","Saudi Arabia","+966"],
  ["🇶🇦","Qatar","+974"],["🇰🇼","Kuwait","+965"],["🇴🇲","Oman","+968"],
  ["🇧🇭","Bahrain","+973"],["🇧🇩","Bangladesh","+880"],["🇵🇰","Pakistan","+92"],
  ["🇱🇰","Sri Lanka","+94"],["🇳🇵","Nepal","+977"],["🇲🇾","Malaysia","+60"],
  ["🇮🇩","Indonesia","+62"],["🇵🇭","Philippines","+63"],["🇹🇭","Thailand","+66"],
  ["🇻🇳","Vietnam","+84"],["🇯🇵","Japan","+81"],["🇰🇷","South Korea","+82"],
  ["🇨🇳","China","+86"],["🇭🇰","Hong Kong","+852"],["🇳🇿","New Zealand","+64"],
  ["🇿🇦","South Africa","+27"],["🇳🇬","Nigeria","+234"],["🇰🇪","Kenya","+254"],
  ["🇪🇬","Egypt","+20"],["🇧🇷","Brazil","+55"],["🇲🇽","Mexico","+52"],
  ["🇦🇷","Argentina","+54"],["🇹🇷","Turkey","+90"]
] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState("en");

  // Profile States
  const [profile, setProfile] = useState({
    displayName: "",
    email: "",
    phone: "",
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Security / Password States
  const [hasPasswordProvider, setHasPasswordProvider] = useState(false);
  const [hasGoogleProvider, setHasGoogleProvider] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Dashboard Settings States
  const [selectedDashboardMetrics, setSelectedDashboardMetrics] =
    useState<DashboardMetricId[]>(DEFAULT_DASHBOARD_METRICS);
  const [dashboardSettingsLoading, setDashboardSettingsLoading] =
    useState(true);
  const [dashboardSettingsSaving, setDashboardSettingsSaving] =
    useState(false);
  const [dashboardSaved, setDashboardSaved] = useState(false);

  // Notification Preference States
  const [
    notificationPreferences,
    setNotificationPreferences,
  ] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [
    notificationSettingsLoading,
    setNotificationSettingsLoading,
  ] = useState(true);
  const [notificationChannelsSaving, setNotificationChannelsSaving] = useState(false);
  const [notificationTypesSaving, setNotificationTypesSaving] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [notificationChannelsSaved, setNotificationChannelsSaved] = useState(false);
  const [notificationTypesSaved, setNotificationTypesSaved] = useState(false);
  const [whatsappCountryCode, setWhatsappCountryCode] = useState("+91");
  const [whatsappLocalNumber, setWhatsappLocalNumber] = useState("");
  const [whatsappCountrySearch, setWhatsappCountrySearch] = useState("");
  const [whatsappCountryOpen, setWhatsappCountryOpen] = useState(false);
  const [whatsappConsentChecked, setWhatsappConsentChecked] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const [whatsappEditing, setWhatsappEditing] = useState(true);

  useEffect(() => {
    setMounted(true);

    const savedLanguage = localStorage.getItem("shipin-language");

    if (savedLanguage) {
      setLanguage(savedLanguage);
    }
  }, []);

  // Load the profile
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setProfileLoading(false);
        return;
      }

      const providers = user.providerData.map((provider) => provider.providerId);
      setHasPasswordProvider(providers.includes("password"));
      setHasGoogleProvider(providers.includes("google.com"));

      try {
        let savedProfile = await getUserProfile(user.uid);

        /*
        * Ensure the Firestore user document always
        * contains the authenticated account details.
        *
        * createUserProfile uses merge: true, so existing
        * preferences and other user data are preserved.
        */
       if (
         !savedProfile ||
         !savedProfile.email
       ) {
         await createUserProfile(user.uid, {
           displayName:
             savedProfile?.displayName ||
             user.displayName ||
             "",

           email:
             user.email ||
             savedProfile?.email ||
             "",

           phone:
             savedProfile?.phone ||
             user.phoneNumber ||
             "",

           photoURL:
             savedProfile?.photoURL ||
             user.photoURL ||
             "",
         });

         savedProfile =
           await getUserProfile(user.uid);
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

  // Load the customer's saved selection
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

  // Step 3C — Load the preferences
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
          .find((country) => savedPhone.startsWith(country[2]));
        if (match) {
          setWhatsappCountryCode(match[2]);
          setWhatsappLocalNumber(savedPhone.slice(match[2].length).replace(/\D/g, ""));
        }
        setWhatsappConsentChecked(Boolean(preferences.whatsapp.consentedAt));
        setWhatsappEditing(!Boolean(savedPhone && preferences.whatsapp.consentedAt));
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
        if (current.length <= MIN_DASHBOARD_METRICS) {
          return current;
        }

        return current.filter((id) => id !== metricId);
      }

      return [...current, metricId];
    });
  }

  function restoreDashboardDefaults() {
    setSelectedDashboardMetrics(DEFAULT_DASHBOARD_METRICS);
    setDashboardSaved(false);
  }

  async function handleSaveProfile() {
    const user = auth.currentUser;

    if (!user) {
      alert("Please login first.");
      return;
    }

    const displayName = profile.displayName.trim();
    const phone = profile.phone.trim();

    if (!displayName) {
      alert("Please enter your name.");
      return;
    }

    try {
      setProfileSaving(true);
      setProfileSaved(false);

      await updateUserProfile(user.uid, {
        displayName,
        phone,
      });

      await updateProfile(user, {
        displayName,
      });

      setProfile((current) => ({
        ...current,
        displayName,
        phone,
      }));

      setEditingProfile(false);
      setProfileSaved(true);
    } catch (error) {
      console.error("Failed to update profile:", error);
      alert("Unable to update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Your new password must contain at least 6 characters.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError(
        "Your new password must be different from your current password."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
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
      setPasswordMessage("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Failed to update password:", error);
      setPasswordError(error.message || "Failed to update password.");
    } finally {
      setChangingPassword(false);
    }
  }

  // Step 3D — Add the handlers
  function toggleNotificationChannel(
    channel: keyof NotificationPreferences["channels"]
  ) {
    setNotificationChannelsSaved(false);

    setNotificationPreferences((current) => ({
      ...current,
      channels: {
        ...current.channels,
        [channel]: !current.channels[channel],
      },
    }));
  }

  function toggleNotificationCategory(
    category: keyof NotificationCategoryPreferences
  ) {
    setNotificationTypesSaved(false);

    setNotificationPreferences((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [category]: !current.categories[category],
      },
    }));
  }

  async function saveNotifications(saveTarget: "channels" | "types" | "whatsapp") {
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }

    let phone = notificationPreferences.whatsapp.phone.trim();

    if (notificationPreferences.channels.whatsapp) {
      const local = whatsappLocalNumber.replace(/\D/g, "");
      phone = `${whatsappCountryCode}${local}`;

      if (!local || phone.replace(/\D/g, "").length < 8 || phone.replace(/\D/g, "").length > 15) {
        alert("Please enter a valid WhatsApp number.");
        return;
      }

      if (!whatsappConsentChecked) {
        alert("Please confirm your consent to receive transactional WhatsApp updates.");
        return;
      }
    }

    try {
      if (saveTarget === "channels") {
        setNotificationChannelsSaving(true);
        setNotificationChannelsSaved(false);
      }
      if (saveTarget === "types") {
        setNotificationTypesSaving(true);
        setNotificationTypesSaved(false);
      }
      if (saveTarget === "whatsapp") {
        setWhatsappSaving(true);
        setWhatsappSaved(false);
      }

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
        setWhatsappSaved(true);
        setWhatsappEditing(false);
        setWhatsappCountryOpen(false);
      } else if (saveTarget === "channels") {
        setNotificationChannelsSaved(true);
      } else {
        setNotificationTypesSaved(true);
      }
    } catch (error) {
      console.error("Failed to save notification preferences:", error);
      alert(error instanceof Error ? error.message : "Unable to save notification preferences.");
    } finally {
      if (saveTarget === "channels") setNotificationChannelsSaving(false);
      if (saveTarget === "types") setNotificationTypesSaving(false);
      if (saveTarget === "whatsapp") setWhatsappSaving(false);
    }
  }

  async function handleSaveNotificationChannels() {
    await saveNotifications("channels");
  }

  async function handleSaveNotificationTypes() {
    await saveNotifications("types");
  }

  async function handleSaveWhatsApp() {
    await saveNotifications("whatsapp");
  }

  async function handleSaveDashboardSettings() {
    const user = auth.currentUser;

    if (!user) {
      alert("Please login first.");
      return;
    }

    try {
      setDashboardSettingsSaving(true);
      setDashboardSaved(false);

      await saveDashboardMetrics(user.uid, selectedDashboardMetrics);

      setDashboardSaved(true);
    } catch (error) {
      console.error("Failed to save dashboard settings:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Unable to save dashboard settings."
      );
    } finally {
      setDashboardSettingsSaving(false);
    }
  }

  function changeLanguage(value: string) {
    setLanguage(value);
    localStorage.setItem("shipin-language", value);
  }

  if (!mounted) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-slate-950 dark:text-white">
          Settings
        </h1>

        <p className="mt-2 text-slate-400">
          Customize your ShipIN experience.
        </p>
      </div>

      <div className="space-y-6">
        {/* ACCOUNT */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
                <UserRound size={21} />
              </div>

              <div>
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                  Account
                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Manage your personal information.
                </p>
              </div>
            </div>

            {!editingProfile && !profileLoading && (
              <button
                type="button"
                onClick={() => {
                  setEditingProfile(true);
                  setProfileSaved(false);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Pencil size={15} />
                Edit Profile
              </button>
            )}
          </div>

          {profileLoading ? (
            <div className="mt-6 rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Loading profile...
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Full Name
                </label>

                <input
                  value={profile.displayName}
                  disabled={!editingProfile}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      displayName: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-purple-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-950 dark:disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email Address
                </label>

                <input
                  value={profile.email}
                  disabled
                  className="w-full rounded-xl border border-slate-300 bg-slate-100 p-3 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-500"
                />

                <p className="mt-2 text-xs text-slate-500">
                  Your login email cannot be changed here.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Phone Number
                </label>

                <input
                  type="tel"
                  value={profile.phone}
                  disabled={!editingProfile}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      phone: e.target.value,
                    }))
                  }
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-purple-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-950 dark:disabled:text-slate-500"
                />
              </div>

              {profileSaved && (
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  Profile updated successfully.
                </p>
              )}

              {editingProfile && (
                <div className="flex justify-end gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={profileSaving}
                    onClick={() => setEditingProfile(false)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <X size={17} />
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={profileSaving}
                    onClick={handleSaveProfile}
                    className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50"
                  >
                    <Save size={17} />
                    {profileSaving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* SECURITY */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
              <ShieldCheck size={21} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Security
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Manage your account authentication and password.
              </p>
            </div>
          </div>

          <div className="mt-6 border-b border-slate-200 pb-6 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Sign-in methods
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {hasPasswordProvider && (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Email & Password
                </span>
              )}

              {hasGoogleProvider && (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Google
                </span>
              )}
            </div>
          </div>

          {hasPasswordProvider && (
            <div className="mt-6">
              <h3 className="font-semibold text-slate-950 dark:text-white">
                Change Password
              </h3>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Verify your current password before choosing a new one.
              </p>

              <form
                onSubmit={handleChangePassword}
                className="mt-5 space-y-4"
              >
                <PasswordField
                  label="Current Password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />

                <PasswordField
                  label="New Password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />

                <PasswordField
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />

                {passwordError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                    {passwordError}
                  </div>
                )}

                {passwordMessage && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-600 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400">
                    {passwordMessage}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50"
                  >
                    {changingPassword ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {!hasPasswordProvider && hasGoogleProvider && (
            <div className="mt-6">
              <h3 className="font-semibold text-slate-950 dark:text-white">
                Change Password
              </h3>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Your password is managed by Google. To change it, update your
                password through your Google Account.
              </p>

              <div className="mt-5 space-y-4 opacity-60">
                <PasswordField
                  label="Current Password"
                  value=""
                  onChange={() => {}}
                  autoComplete="current-password"
                  disabled
                />

                <PasswordField
                  label="New Password"
                  value=""
                  onChange={() => {}}
                  autoComplete="new-password"
                  disabled
                />

                <PasswordField
                  label="Confirm New Password"
                  value=""
                  onChange={() => {}}
                  autoComplete="new-password"
                  disabled
                />

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled
                    className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white opacity-50"
                  >
                    Update Password
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* APPEARANCE */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Appearance
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose how ShipIN looks on this device.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {(["light", "dark", "system"] as ThemeOption[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={`rounded-xl border p-4 text-left transition ${
                  theme === option
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
                }`}
              >
                <div className="font-semibold capitalize text-slate-900 dark:text-white">
                  {option}
                </div>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {option === "light"
                    ? "Always use the light theme."
                    : option === "dark"
                    ? "Always use the dark theme."
                    : "Match your device appearance."}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* LANGUAGE */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Language
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Select your preferred display language.
          </p>
          <div className="mt-4">
            <select
              value={language}
              onChange={(e) => changeLanguage(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-purple-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
            </select>
          </div>
        </section>

        {/* Step 3E — Add the UI: NOTIFICATION PREFERENCES */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
              <Bell size={21} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Notification Channels
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Choose how ShipIN should notify you.
              </p>
            </div>
          </div>

          {notificationSettingsLoading ? (
            <div className="mt-6 rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Loading notification preferences...
            </div>
          ) : (
            <>
              {/* CHANNELS */}
              <div className="mt-7">
                <h3 className="font-semibold text-slate-950 dark:text-white">
                  Notification Channels
                </h3>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Select where ShipIN can send your notifications.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <NotificationChannelCard
                    icon={<Bell size={20} />}
                    title="In-App"
                    description="Notifications inside ShipIN."
                    enabled={notificationPreferences.channels.inApp}
                    onClick={() => toggleNotificationChannel("inApp")}
                  />

                  <NotificationChannelCard
                    icon={<Mail size={20} />}
                    title="Email"
                    description="Updates sent to your email."
                    enabled={notificationPreferences.channels.email}
                    onClick={() => toggleNotificationChannel("email")}
                  />

                  <NotificationChannelCard
                    icon={<MessageCircle size={20} />}
                    title="WhatsApp"
                    description="Transactional updates on WhatsApp."
                    enabled={notificationPreferences.channels.whatsapp}
                    onClick={() => {
                      setNotificationChannelsSaved(false);

                      setNotificationPreferences((current) => ({
                        ...current,
                        channels: {
                          ...current.channels,
                          whatsapp: !current.channels.whatsapp,
                        },
                        whatsapp: {
                          ...current.whatsapp,
                          consentedAt: current.channels.whatsapp
                            ? undefined
                            : current.whatsapp.consentedAt,
                        },
                      }));
                    }}
                  />
                </div>

                {notificationPreferences.channels.whatsapp && (
                  <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-500/20 dark:bg-green-500/10">
                    <div className="flex gap-3">
                      <MessageCircle size={20} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-semibold text-green-900 dark:text-green-300">
                              WhatsApp Notifications
                            </h4>

                            {!whatsappEditing &&
                            notificationPreferences.whatsapp.phone ? (
                              <p className="mt-1 text-sm text-green-800 dark:text-green-300/80">
                                Notifications will be sent to{" "}
                                <span className="font-semibold">
                                  {notificationPreferences.whatsapp.phone}
                                </span>
                              </p>
                            ) : (
                              <p className="mt-1 text-sm leading-6 text-green-800 dark:text-green-300/80">
                                Choose your country code and enter the WhatsApp number where you want to receive transactional ShipIN updates.
                              </p>
                            )}
                          </div>

                          {!whatsappEditing &&
                            notificationPreferences.whatsapp.phone && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWhatsappEditing(true);
                                  setWhatsappSaved(false);
                                }}
                                className="shrink-0 rounded-lg border border-green-300 bg-white/70 px-3 py-1.5 text-sm font-semibold text-green-700 transition hover:bg-white dark:border-green-500/30 dark:bg-slate-950/40 dark:text-green-400 dark:hover:bg-slate-950"
                              >
                                Edit
                              </button>
                            )}
                        </div>

                        {whatsappEditing && (
                          <>
                            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                              <div className="relative">
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                  Country / Code
                                </label>

                                <button
                                  type="button"
                                  onClick={() => setWhatsappCountryOpen((v) => !v)}
                                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                >
                                  <span className="truncate">
                                    {WHATSAPP_COUNTRIES.find((c) => c[2] === whatsappCountryCode)?.[0]}{" "}
                                    {WHATSAPP_COUNTRIES.find((c) => c[2] === whatsappCountryCode)?.[1]}
                                  </span>
                                  <span className="flex shrink-0 items-center gap-1 font-medium">
                                    {whatsappCountryCode} <ChevronDown size={15} />
                                  </span>
                                </button>

                                {whatsappCountryOpen && (
                                  <div className="absolute z-30 mt-2 w-full min-w-[290px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
                                    <div className="border-b border-slate-200 p-3 dark:border-slate-800">
                                      <input
                                        autoFocus
                                        value={whatsappCountrySearch}
                                        onChange={(e) => setWhatsappCountrySearch(e.target.value)}
                                        placeholder="Search country or code..."
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                      />
                                    </div>

                                    <div className="max-h-64 overflow-y-auto p-1">
                                      {WHATSAPP_COUNTRIES.filter((c) => {
                                        const q = whatsappCountrySearch.trim().toLowerCase();
                                        return !q || c[1].toLowerCase().includes(q) || c[2].includes(q);
                                      }).map((c) => (
                                        <button
                                          key={`${c[1]}-${c[2]}`}
                                          type="button"
                                          onClick={() => {
                                            setWhatsappCountryCode(c[2]);
                                            setWhatsappCountryOpen(false);
                                            setWhatsappCountrySearch("");
                                            setWhatsappSaved(false);
                                          }}
                                          className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                                        >
                                          <span>{c[0]} {c[1]}</span>
                                          <span className="font-medium">{c[2]}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                  WhatsApp Number
                                </label>

                                <div className="flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-purple-500 dark:border-slate-700 dark:bg-slate-950">
                                  <span className="flex items-center border-r border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                                    {whatsappCountryCode}
                                  </span>
                                  <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={whatsappLocalNumber}
                                    onChange={(e) => {
                                      setWhatsappLocalNumber(e.target.value.replace(/\D/g, ""));
                                      setWhatsappSaved(false);
                                      setNotificationPreferences((current) => ({
                                        ...current,
                                        whatsapp: { ...current.whatsapp, consentedAt: undefined },
                                      }));
                                    }}
                                    placeholder="9876543210"
                                    className="min-w-0 flex-1 bg-transparent p-3 text-slate-900 outline-none dark:text-white"
                                  />
                                </div>
                              </div>
                            </div>

                            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-green-200 bg-white/60 p-3 dark:border-green-500/20 dark:bg-slate-950/40">
                              <input
                                type="checkbox"
                                checked={whatsappConsentChecked}
                                onChange={(e) => {
                                  setWhatsappConsentChecked(e.target.checked);
                                  setWhatsappSaved(false);
                                }}
                                className="mt-0.5 h-4 w-4 accent-purple-600"
                              />
                              <span className="text-xs leading-5 text-slate-600 dark:text-slate-400">
                                I agree to receive transactional WhatsApp messages from ShipIN about my requests, payments, warehouse activity and shipments. I can disable WhatsApp notifications at any time.
                              </span>
                            </label>

                            <div className="mt-4 flex items-center justify-end gap-3">
                              {whatsappSaved && (
                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                  WhatsApp number saved
                                </span>
                              )}
                              <button
                                type="button"
                                disabled={whatsappSaving}
                                onClick={handleSaveWhatsApp}
                                className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                              >
                                {whatsappSaving ? "Saving..." : "Save WhatsApp"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-4 border-t border-slate-200 pt-6 dark:border-slate-800">
                {notificationChannelsSaved && (
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    Saved
                  </span>
                )}

                <button
                  type="button"
                  disabled={notificationChannelsSaving}
                  onClick={handleSaveNotificationChannels}
                  className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {notificationChannelsSaving ? "Saving..." : "Save Channels"}
                </button>
              </div>
            </>
          )}
        </section>

        {/* NOTIFICATION TYPES */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
              <Bell size={20} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Notification Types
              </h2>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Choose which kinds of ShipIN updates you want to receive.
              </p>
            </div>
          </div>

          {notificationSettingsLoading ? (
            <div className="mt-6 rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Loading notification preferences...
            </div>
          ) : (
            <>
              <div className="mt-7">
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <NotificationTypeCard
                    icon={<PackageCheck size={19} />}
                    title="Quote Updates"
                    description="Quote creation, changes and expiration."
                    enabled={notificationPreferences.categories.quote}
                    onClick={() => toggleNotificationCategory("quote")}
                  />

                  <NotificationTypeCard
                    icon={<CreditCard size={19} />}
                    title="Payment Updates"
                    description="Payment confirmations and refunds."
                    enabled={notificationPreferences.categories.payment}
                    onClick={() => toggleNotificationCategory("payment")}
                  />

                  <NotificationTypeCard
                    icon={<Warehouse size={19} />}
                    title="Warehouse Updates"
                    description="Arrival, inspection and warehouse activity."
                    enabled={notificationPreferences.categories.warehouse}
                    onClick={() => toggleNotificationCategory("warehouse")}
                  />

                  <NotificationTypeCard
                    icon={<Truck size={19} />}
                    title="Shipping Updates"
                    description="Packing, dispatch and transit updates."
                    enabled={notificationPreferences.categories.shipping}
                    onClick={() => toggleNotificationCategory("shipping")}
                  />

                  <NotificationTypeCard
                    icon={<CircleCheckBig size={19} />}
                    title="Delivery Updates"
                    description="Out-for-delivery and delivery confirmations."
                    enabled={notificationPreferences.categories.delivery}
                    onClick={() => toggleNotificationCategory("delivery")}
                  />

                  <NotificationTypeCard
                    icon={<Headphones size={19} />}
                    title="Support Updates"
                    description="Replies and updates from ShipIN support."
                    enabled={notificationPreferences.categories.support}
                    onClick={() => toggleNotificationCategory("support")}
                  />
                </div>
              </div>

              {/* SAVE */}
              <div className="mt-6 flex items-center justify-end gap-4 border-t border-slate-200 pt-6 dark:border-slate-800">
                {notificationTypesSaved && (
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    Saved
                  </span>
                )}

                <button
                  type="button"
                  disabled={notificationTypesSaving}
                  onClick={handleSaveNotificationTypes}
                  className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {notificationTypesSaving
                    ? "Saving..."
                    : "Save Types"}
                </button>
              </div>
            </>
          )}
        </section>

        {/* DASHBOARD STATUS CARDS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
                <LayoutDashboard size={21} />
              </div>

              <div>
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                  Dashboard Status Cards
                </h2>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Select which metric cards to show on your customer dashboard.
                </p>

                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Select at least {MIN_DASHBOARD_METRICS} metrics. You can select
                  up to all available metrics.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={restoreDashboardDefaults}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw size={15} />
              Reset Defaults
            </button>
          </div>

          {dashboardSettingsLoading ? (
            <div className="mt-6 rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Loading dashboard settings...
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {dashboardMetrics.map((metric) => {
                  const selected = selectedDashboardMetrics.includes(
                    metric.id
                  );

                  return (
                    <button
                      key={metric.id}
                      type="button"
                      onClick={() => toggleDashboardMetric(metric.id)}
                      className={`flex items-start gap-4 rounded-xl border p-4 text-left transition ${
                        selected
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {metric.label}
                          </span>

                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              selected
                                ? "border-purple-600 bg-purple-600 text-white"
                                : "border-slate-300 text-transparent dark:border-slate-700"
                            }`}
                          >
                            <Check size={13} />
                          </div>
                        </div>

                        <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                          {metric.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-4 border-t border-slate-200 pt-5 dark:border-slate-800">
                {dashboardSaved && (
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    Saved
                  </span>
                )}

                <button
                  type="button"
                  disabled={dashboardSettingsSaving}
                  onClick={handleSaveDashboardSettings}
                  className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50"
                >
                  {dashboardSettingsSaving ? "Saving..." : "Save Dashboard"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-purple-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-950 dark:disabled:text-slate-600"
      />
    </div>
  );
}

// Step 3F — Reusable Card Helper Components
function NotificationChannelCard({
  icon,
  title,
  description,
  enabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        enabled
          ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10"
          : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            enabled
              ? "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
              : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {icon}
        </div>

        <div
          className={`relative h-6 w-11 rounded-full transition ${
            enabled ? "bg-purple-600" : "bg-slate-300 dark:bg-slate-700"
          }`}
        >
          <div
            className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
              enabled ? "left-6" : "left-1"
            }`}
          />
        </div>
      </div>

      <div className="mt-4 font-semibold text-slate-900 dark:text-white">
        {title}
      </div>

      <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </button>
  );
}

function NotificationTypeCard({
  icon,
  title,
  description,
  enabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-4 rounded-xl border p-4 text-left transition ${
        enabled
          ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10"
          : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          enabled
            ? "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
            : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        }`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-900 dark:text-white">
            {title}
          </span>

          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
              enabled
                ? "border-purple-600 bg-purple-600 text-white"
                : "border-slate-300 text-transparent dark:border-slate-700"
            }`}
          >
            <Check size={13} />
          </div>
        </div>

        <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </button>
  );
}