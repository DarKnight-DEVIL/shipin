"use client";

/**
 * Security key / passkey enrollment.
 *
 * Registration is the standard two-step ceremony: ask the server for options,
 * let the browser create a credential, then hand the attestation back for
 * verification. The public key is stored server-side and is what makes later
 * sign-ins verifiable.
 */

import { useState } from "react";

import { MfaApiError } from "@/lib/mfaApi";
import type { MfaConfigStatus } from "@/lib/mfaSetupClient";
import {
  WebAuthnCeremonyError,
  completeSecurityKeyRegistration,
  isWebAuthnSupported,
  registerSecurityKey,
  removeSecurityKey,
} from "@/lib/webauthnClient";
import SecurityCard, { StatusPill } from "./SecurityCard";

function formatDate(value: number): string {
  if (!value) return "unknown date";

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WebAuthnCard({
  idToken,
  status,
  onChanged,
}: {
  idToken: string;
  status: MfaConfigStatus;
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const supported = isWebAuthnSupported();
  const keys = status.webauthn.credentials;

  function describeError(requestError: unknown, fallback: string) {
    if (
      requestError instanceof MfaApiError ||
      requestError instanceof WebAuthnCeremonyError
    ) {
      return requestError.message;
    }

    return fallback;
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    const label = name.trim() || "Security key";

    try {
      const credential = await registerSecurityKey(idToken, label);

      await completeSecurityKeyRegistration(idToken, credential, label);

      setName("");
      setNotice(`${label} registered.`);
      await onChanged();
    } catch (requestError) {
      setError(describeError(requestError, "Could not register this key."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await removeSecurityKey(idToken, id);

      setPendingRemoval(null);
      setNotice("Security key removed.");
      await onChanged();
    } catch (requestError) {
      setError(describeError(requestError, "Could not remove this key."));
      setPendingRemoval(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SecurityCard
      title="Security key or passkey"
      description="Sign in with a hardware key or the passkey built into this device. Registration requires a browser that supports WebAuthn over HTTPS."
      badge={
        <StatusPill
          enabled={keys.length > 0}
          label={
            keys.length > 0
              ? `${keys.length} registered`
              : undefined
          }
        />
      }
    >
      <div className="space-y-4">
        {keys.length > 0 ? (
          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-white">{key.name}</p>
                  <p className="text-xs text-slate-500">
                    Added {formatDate(key.createdAt)}
                  </p>
                </div>

                {pendingRemoval === key.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-300">Remove?</span>
                    <button
                      type="button"
                      onClick={() => void remove(key.id)}
                      disabled={busy}
                      className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRemoval(null)}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingRemoval(key.id);
                      setError(null);
                    }}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {!supported ? (
          <p className="text-sm text-slate-300">
            This browser does not support security keys. Use a current version
            of Chrome, Edge, Safari or Firefox over HTTPS.
          </p>
        ) : (
          <form onSubmit={register} className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Key name (e.g. YubiKey 5C)"
              maxLength={60}
              className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Waiting for key…" : "Add security key"}
            </button>
          </form>
        )}

        {notice ? <p className="text-xs text-emerald-400">{notice}</p> : null}
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    </SecurityCard>
  );
}
