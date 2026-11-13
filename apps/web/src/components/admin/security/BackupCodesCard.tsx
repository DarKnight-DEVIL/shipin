"use client";

/**
 * Backup code management. Codes are stored hashed, so existing ones can never
 * be displayed again — regenerating replaces all of them and requires a
 * current authenticator code.
 */

import { useState } from "react";

import { MfaApiError } from "@/lib/mfaApi";
import { regenerateBackupCodes, type MfaConfigStatus } from "@/lib/mfaSetupClient";
import BackupCodeList from "./BackupCodeList";
import SecurityCard, { StatusPill } from "./SecurityCard";

export default function BackupCodesCard({
  idToken,
  status,
  onChanged,
}: {
  idToken: string;
  status: MfaConfigStatus;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = status.backupCodes;

  async function regenerate(event: React.FormEvent) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const fresh = await regenerateBackupCodes(idToken, code.trim());

      setCodes(fresh);
      setCode("");
      setOpen(false);
      await onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof MfaApiError
          ? requestError.message
          : "Could not generate new codes."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SecurityCard
      title="Backup codes"
      description="Single-use codes for when your authenticator is not available. Generating a new set invalidates every existing code."
      badge={
        <StatusPill
          enabled={remaining > 0}
          label={
            remaining > 0
              ? `${remaining} unused`
              : "None available"
          }
        />
      }
    >
      <div className="space-y-4">
        {codes.length > 0 ? (
          <>
            <BackupCodeList codes={codes} />
            <button
              type="button"
              onClick={() => setCodes([])}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              Done
            </button>
          </>
        ) : null}

        {codes.length === 0 && !status.totp.enabled ? (
          <p className="text-sm text-slate-300">
            Backup codes are issued together with authenticator enrollment. Set
            up an authenticator app first.
          </p>
        ) : null}

        {codes.length === 0 && status.totp.enabled ? (
          open ? (
            <form onSubmit={regenerate} className="flex flex-wrap gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Current 6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-red-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Generating…" : "Generate new codes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCode("");
                  setError(null);
                }}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setError(null);
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              {remaining > 0 ? "Regenerate backup codes" : "Generate backup codes"}
            </button>
          )
        ) : null}

        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    </SecurityCard>
  );
}
