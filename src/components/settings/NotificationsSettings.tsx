import { ChevronDown } from "lucide-react";

import type { useNotificationSettings } from "@/features/notifications/hooks/useNotificationSettings";
import { WHATSAPP_COUNTRIES } from "@/features/notifications/services/whatsappCountries";
import type { NotificationCategoryPreferences } from "@/types/notificationPreferences";
import SettingsSection from "./SettingsSection";
import { GhostButton, PrimaryButton } from "./SettingsButtons";
import SwitchRow from "./SwitchRow";
import { inputClass } from "./settingsStyles";

const CHANNELS = [
  {
    key: "inApp" as const,
    label: "In-app",
    description: "Updates inside your ShipIN dashboard",
  },
  {
    key: "email" as const,
    label: "Email",
    description: "Sent to your account email",
  },
  {
    key: "whatsapp" as const,
    label: "WhatsApp",
    description: "Transactional updates only",
  },
] as const;

interface NotificationsSettingsProps {
  settings: ReturnType<typeof useNotificationSettings>;
}

export default function NotificationsSettings({
  settings,
}: NotificationsSettingsProps) {
  const {
    preferences,
    loading,
    savingTarget,
    whatsappCountryCode,
    whatsappLocalNumber,
    whatsappCountrySearch,
    whatsappCountryOpen,
    whatsappConsentChecked,
    whatsappEditing,
    setWhatsappCountryCode,
    setWhatsappLocalNumber,
    setWhatsappCountrySearch,
    setWhatsappCountryOpen,
    setWhatsappConsentChecked,
    setWhatsappEditing,
    toggleChannel,
    toggleCategory,
    save,
  } = settings;

  const filteredCountries = WHATSAPP_COUNTRIES.filter((country) => {
    const query = whatsappCountrySearch.trim().toLowerCase();
    if (!query) return true;
    return (
      country[1].toLowerCase().includes(query) || country[2].includes(query)
    );
  });

  return (
    <>
      <SettingsSection
        id="channels"
        title="Notification channels"
        description="Where we can reach you"
      >
        {loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        ) : (
          <>
            <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {CHANNELS.map((channel) => (
                <SwitchRow
                  key={channel.key}
                  label={channel.label}
                  description={channel.description}
                  checked={preferences.channels[channel.key]}
                  onChange={() => toggleChannel(channel.key)}
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <PrimaryButton
                type="button"
                disabled={savingTarget === "channels"}
                onClick={() => save("channels")}
              >
                {savingTarget === "channels" ? "Saving…" : "Save channels"}
              </PrimaryButton>
            </div>
          </>
        )}
      </SettingsSection>

      {preferences.channels.whatsapp && (
        <SettingsSection
          title="WhatsApp number"
          description="Transactional updates only"
        >
          {whatsappEditing ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setWhatsappCountryOpen(!whatsappCountryOpen)}
                    className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 text-[12px]"
                  >
                    <span>
                      {WHATSAPP_COUNTRIES.find(
                        (country) => country[2] === whatsappCountryCode
                      )?.[0] ?? "🌐"}
                    </span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {whatsappCountryCode}
                    </span>
                    <ChevronDown size={13} className="text-[var(--muted-soft)]" />
                  </button>

                  {whatsappCountryOpen && (
                    <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg shadow-slate-950/10 dark:shadow-black/40">
                      <div className="border-b border-[var(--border)] p-2">
                        <input
                          value={whatsappCountrySearch}
                          onChange={(event) =>
                            setWhatsappCountrySearch(event.target.value)
                          }
                          placeholder="Search…"
                          className="app-input py-1.5"
                        />
                      </div>
                      <ul className="max-h-48 overflow-y-auto py-1">
                        {filteredCountries.map((country) => (
                          <li key={`${country[1]}-${country[2]}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setWhatsappCountryCode(country[2]);
                                setWhatsappCountryOpen(false);
                                setWhatsappCountrySearch("");
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                            >
                              <span>{country[0]}</span>
                              <span className="flex-1 truncate">
                                {country[1]}
                              </span>
                              <span className="text-[11px] text-[var(--muted-soft)]">
                                {country[2]}
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
                  onChange={(event) =>
                    setWhatsappLocalNumber(
                      event.target.value.replace(/\D/g, "")
                    )
                  }
                  placeholder="Phone number"
                  className={`${inputClass} flex-1`}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-[12px] leading-5 text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={whatsappConsentChecked}
                  onChange={(event) =>
                    setWhatsappConsentChecked(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-slate-900 dark:accent-white"
                />
                I agree to receive transactional WhatsApp updates from ShipIN
              </label>

              <div className="flex justify-end">
                <PrimaryButton
                  type="button"
                  disabled={savingTarget === "whatsapp"}
                  onClick={() => save("whatsapp")}
                >
                  {savingTarget === "whatsapp" ? "Saving…" : "Save number"}
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] tabular-nums text-[var(--foreground)]">
                {whatsappCountryCode}
                {whatsappLocalNumber}
              </p>
              <GhostButton type="button" onClick={() => setWhatsappEditing(true)}>
                Change
              </GhostButton>
            </div>
          )}
        </SettingsSection>
      )}

      <SettingsSection
        id="types"
        title="Notification types"
        description="What you want to hear about"
      >
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        ) : (
          <>
            <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {(
                Object.entries(preferences.categories) as [
                  keyof NotificationCategoryPreferences,
                  boolean,
                ][]
              ).map(([key, enabled]) => (
                <SwitchRow
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                  checked={enabled}
                  onChange={() => toggleCategory(key)}
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <PrimaryButton
                type="button"
                disabled={savingTarget === "types"}
                onClick={() => save("types")}
              >
                {savingTarget === "types" ? "Saving…" : "Save types"}
              </PrimaryButton>
            </div>
          </>
        )}
      </SettingsSection>
    </>
  );
}
