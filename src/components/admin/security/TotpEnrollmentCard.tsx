"use client";

/**
 * TOTP enrollment: start → scan QR (or copy the secret) → confirm a code →
 * receive backup codes.
 *
 * Re-enrolling replaces the stored secret, so it is behind an explicit
 * confirmation step and invalidates the previous authenticator entry.
 */

import { useState } from "react";

import { MfaApiError } from "@/lib/mfaApi";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  type MfaConfigStatus,
} from "@/lib/mfaSetupClient";
import BackupCodeList from "./BackupCodeList";
import SecurityCard, { StatusPill } from "./SecurityCard";

type Phase =
  | { name: "idle" }
  | {
      name: "scanning";
      secret: string;
      qrUrl: string;
      qrDataUrl: string;
      backupCodes: string[];
    };

export default function TotpEnrollmentCard({
  idToken,
  status,
  onChanged,
}: {
  idToken: string;
  status: MfaConfigStatus;
  onChanged: () => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const enabled = status.totp.enabled;

  async function start() {
    setBusy(true);
    setError(null);

    try {
      const { secret, qrUrl, qrDataUrl } = await beginTotpEnrollment(idToken);

      if (!secret) {
        setError("The server did not return a secret. Try again.");
        return;
      }

      setPhase({ name: "scanning", secret, qrUrl, qrDataUrl, backupCodes: [] });
      setCode("");
    } catch (requestError) {
      setError(
        requestError instanceof MfaApiError
          ? requestError.message
          : "Could not start enrollment."
      );
    } finally {
      setBusy(false);
      setConfirmingReset(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();

    if (phase.name !== "scanning" || busy) return;

    setBusy(true);
    setError(null);

    try {
      const backupCodes = await confirmTotpEnrollment(idToken, code.trim());

      setPhase({ ...phase, backupCodes });
      setCode("");
      await onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof MfaApiError
          ? requestError.message
          : "Could not verify that code."
      );
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setPhase({ name: "idle" });
    setCode("");
    setError(null);
  }

  return (
    <SecurityCard
      title="Authenticator app"
      description="Time-based one-time codes from an authenticator app such as 1Password, Authy or Google Authenticator. Enabling this also issues backup codes."
      badge={
        <StatusPill
          enabled={enabled}
          label={
            enabled
              ? "Enabled"
              : status.totp.pending
                ? "Setup incomplete"
                : undefined
          }
        />
      }
    >
      {phase.name === "idle" ? (
        <div className="space-y-3">
          {enabled ? (
            <p className="text-sm text-slate-300">
              Authenticator codes are active. Re-enrolling generates a new
              secret and replaces your current backup codes.
            </p>
          ) : (
            <p className="text-sm text-slate-300">
              {status.totp.pending
                ? "Enrollment was started but never confirmed. Start again to get a fresh secret."
                : "No authenticator is set up for this account."}
            </p>
          )}

          {confirmingReset ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <span className="flex-1">
                Replace the current authenticator secret?
              </span>
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
              >
                Yes, replace
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (enabled ? setConfirmingReset(true) : start())}
              disabled={busy}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? "Starting…"
                : enabled
                  ? "Re-enroll authenticator"
                  : "Set up authenticator"}
            </button>
          )}

          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        </div>
      ) : null}

      {phase.name === "scanning" ? (
        <div className="space-y-5">
          {phase.backupCodes.length === 0 ? (
            <>
              <div className="flex flex-wrap items-start gap-6">
                <div
                  className="rounded-xl bg-white p-3"
                  data-testid="qr"
                >
                  {phase.qrDataUrl ? (
                    // Rendered server-side so no QR library ships to the client.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={phase.qrDataUrl}
                      alt="QR code for authenticator setup"
                      width={168}
                      height={168}
                    />
                  ) : (
                    <p className="w-[168px] text-center text-xs text-slate-600">
                      QR code unavailable — enter the key below manually.
                    </p>
                  )}
                </div>

                <div className="min-w-[240px] flex-1 space-y-3">
                  <p className="text-sm text-slate-300">
                    1. Scan the code with your authenticator app.
                  </p>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Or enter this key manually
                    </p>
                    <code className="mt-1 block break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
                      {phase.secret}
                    </code>
                  </div>

                  <form onSubmit={confirm} className="space-y-2">
                    <p className="text-sm text-slate-300">
                      2. Enter the 6-digit code it shows.
                    </p>
                    <input
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-red-500"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? "Verifying…" : "Verify and enable"}
                    </button>
                  </form>

                  {error ? (
                    <p className="text-xs text-rose-400">{error}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={cancel}
                    className="text-xs text-slate-400 underline-offset-2 transition hover:text-slate-200 hover:underline"
                  >
                    Cancel setup
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <BackupCodeList codes={phase.backupCodes} />
              <button
                type="button"
                onClick={() => setPhase({ name: "idle" })}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                I have saved my codes
              </button>
            </>
          )}
        </div>
      ) : null}
    </SecurityCard>
  );
}
