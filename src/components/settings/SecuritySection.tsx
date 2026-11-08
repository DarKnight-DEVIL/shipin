import type { usePasswordSettings } from "@/features/auth/hooks/usePasswordSettings";
import SettingsSection from "./SettingsSection";
import { PrimaryButton } from "./SettingsButtons";
import { inputClass, labelClass } from "./settingsStyles";

interface SecuritySectionProps {
  settings: ReturnType<typeof usePasswordSettings>;
  hasPasswordProvider: boolean;
  hasGoogleProvider: boolean;
}

export default function SecuritySection({
  settings,
  hasPasswordProvider,
  hasGoogleProvider,
}: SecuritySectionProps) {
  const {
    currentPassword,
    newPassword,
    confirmPassword,
    changing,
    message,
    error,
    setCurrentPassword,
    setNewPassword,
    setConfirmPassword,
    submit,
  } = settings;

  return (
    <SettingsSection
      id="security"
      title="Security"
      description="Password and sign-in methods"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {hasPasswordProvider && (
          <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--muted)]">
            Email & password
          </span>
        )}
        {hasGoogleProvider && (
          <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--muted)]">
            Google
          </span>
        )}
      </div>

      {hasPasswordProvider ? (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className={labelClass}>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
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
                onChange={(event) => setNewPassword(event.target.value)}
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={labelClass}>Confirm new</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
          </div>
          {error && (
            <p className="text-[12px] text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          {message && (
            <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
              {message}
            </p>
          )}
          <div className="flex justify-end">
            <PrimaryButton type="submit" disabled={changing}>
              {changing ? "Updating…" : "Update password"}
            </PrimaryButton>
          </div>
        </form>
      ) : (
        <p className="text-[12px] leading-5 text-[var(--muted)]">
          You sign in with Google. Password changes aren’t available for this
          account.
        </p>
      )}
    </SettingsSection>
  );
}
