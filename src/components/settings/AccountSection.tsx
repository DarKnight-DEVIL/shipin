import type { useProfileSettings } from "@/features/users/hooks/useProfileSettings";
import SettingsSection from "./SettingsSection";
import { GhostButton, PrimaryButton } from "./SettingsButtons";
import { inputClass, labelClass } from "./settingsStyles";

interface AccountSectionProps {
  settings: ReturnType<typeof useProfileSettings>;
}

export default function AccountSection({ settings }: AccountSectionProps) {
  const {
    profile,
    loading,
    editing,
    saving,
    setField,
    setEditing,
    save,
  } = settings;

  return (
    <SettingsSection
      id="account"
      title="Account"
      description="Your name and contact details"
    >
      {loading ? (
        <div className="h-24 animate-pulse rounded-lg bg-[var(--surface-3)]" />
      ) : (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              value={profile.displayName}
              disabled={!editing}
              onChange={(event) => setField("displayName", event.target.value)}
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
              disabled={!editing}
              onChange={(event) => setField("phone", event.target.value)}
              placeholder="+91 98765 43210"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            {editing ? (
              <>
                <GhostButton
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </GhostButton>
                <PrimaryButton type="button" disabled={saving} onClick={save}>
                  {saving ? "Saving…" : "Save"}
                </PrimaryButton>
              </>
            ) : (
              <GhostButton type="button" onClick={() => setEditing(true)}>
                Edit
              </GhostButton>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
