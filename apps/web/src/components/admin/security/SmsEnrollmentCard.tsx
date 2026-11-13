"use client";

/**
 * SMS enrollment: send a code to an E.164 number, then confirm it.
 *
 * The delivered code lives server-side for five minutes and is deleted once
 * confirmed.
 */

import { useState } from "react";

import { MfaApiError } from "@/lib/mfaApi";
import {
  confirmSmsCode,
  sendSmsCode,
  type MfaConfigStatus,
} from "@/lib/mfaSetupClient";
import SecurityCard, { StatusPill } from "./SecurityCard";

const E164 = /^\+[1-9]\d{1,14}$/;

export default function SmsEnrollmentCard({
  idToken,
  status,
  onChanged,
}: {
  idToken: string;
  status: MfaConfigStatus;
  onChanged: () => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<"idle" | "code-sent">("idle");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function errorMessage(requestError: unknown, fallback: string) {
    return requestError instanceof MfaApiError
      ? requestError.message
      : fallback;
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();

    if (busy) return;

    const value = phoneNumber.trim();

    if (!E164.test(value)) {
      setError("Use international format, for example +15551234567.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const message = await sendSmsCode(idToken, value);

      setPhase("code-sent");
      setNotice(message);
      setCode("");
    } catch (requestError) {
      setError(errorMessage(requestError, "Could not send the code."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const message = await confirmSmsCode(idToken, code.trim());

      setPhase("idle");
      setNotice(message);
      setCode("");
      setPhoneNumber("");
      await onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError, "Could not verify that code."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SecurityCard
      title="SMS codes"
      description="Receive a 6-digit code by message. Useful as a fallback when your authenticator is unavailable, but weaker than an app-based code."
      badge={
        <StatusPill
          enabled={status.sms.enabled}
          label={
            status.sms.enabled
              ? status.sms.phoneNumber ?? "Enabled"
              : undefined
          }
        />
      }
    >
      {phase === "idle" ? (
        <form onSubmit={send} className="space-y-3">
          <label
            htmlFor="mfa-phone"
            className="block text-xs font-medium uppercase tracking-wide text-slate-400"
          >
            {status.sms.enabled ? "Replace phone number" : "Phone number"}
          </label>

          <div className="flex flex-wrap gap-2">
            <input
              id="mfa-phone"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+15551234567"
              inputMode="tel"
              autoComplete="tel"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </div>

          {notice ? (
            <p className="text-xs text-emerald-400">{notice}</p>
          ) : null}
          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-3">
          {notice ? (
            <p className="text-xs text-emerald-400">{notice}</p>
          ) : null}

          <label
            htmlFor="mfa-sms-code"
            className="block text-xs font-medium uppercase tracking-wide text-slate-400"
          >
            Enter the code we sent
          </label>

          <div className="flex flex-wrap gap-2">
            <input
              id="mfa-sms-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="min-w-[160px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify and enable"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setCode("");
                setError(null);
                setNotice(null);
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>

          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        </form>
      )}
    </SecurityCard>
  );
}
