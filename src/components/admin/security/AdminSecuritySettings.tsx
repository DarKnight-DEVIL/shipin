"use client";

/**
 * Admin security screen.
 *
 * Loads the caller's MFA configuration and elevation state, then renders one
 * card per second factor. Every action re-reads the status so the screen never
 * drifts from what the server actually has.
 */

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ShieldCheck } from "lucide-react";

import { auth } from "@/lib/firebase";
import { MfaApiError } from "@/lib/mfaApi";
import { getMfaConfigStatus, type MfaConfigStatus } from "@/lib/mfaSetupClient";
import {
  getMfaSessionStatus,
  type MfaSessionStatus,
} from "@/lib/mfaSessionClient";
import BackupCodesCard from "./BackupCodesCard";
import SmsEnrollmentCard from "./SmsEnrollmentCard";
import TotpEnrollmentCard from "./TotpEnrollmentCard";
import WebAuthnCard from "./WebAuthnCard";

type Loaded = {
  idToken: string;
  config: MfaConfigStatus;
  session: MfaSessionStatus;
};

function formatExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "in 30 minutes";

  return new Date(expiresAt * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSecuritySettings() {
  const [state, setState] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (user = auth.currentUser) => {
    if (!user) return;

    setError(null);

    try {
      const idToken = await user.getIdToken();
      const [config, session] = await Promise.all([
        getMfaConfigStatus(idToken),
        getMfaSessionStatus(idToken),
      ]);

      setState({ idToken, config, session });
    } catch (requestError) {
      setError(
        requestError instanceof MfaApiError
          ? requestError.message
          : "Could not load your security settings."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) void load(user);
    });

    return unsubscribe;
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-slate-400">Loading security settings…</p>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <p className="text-sm text-rose-400">{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-slate-400">
          Sign in as an administrator to manage second factors.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Security</h1>
        <p className="mt-1 text-sm text-slate-400">
          Admin actions require a second factor. Codes are verified once per
          session instead of on every request.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
        <ShieldCheck
          size={18}
          className={state.session.elevated ? "text-emerald-400" : "text-amber-300"}
        />
        <span className="flex-1 text-slate-200">
          {state.session.elevated
            ? `This session is verified until ${formatExpiry(state.session.expiresAt)}.`
            : "This session is not verified yet — use the banner at the top of the admin area to enter a code."}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-xs text-rose-400">{error}</p> : null}

      <TotpEnrollmentCard
        idToken={state.idToken}
        status={state.config}
        onChanged={refresh}
      />

      <BackupCodesCard
        idToken={state.idToken}
        status={state.config}
        onChanged={refresh}
      />

      <WebAuthnCard
        idToken={state.idToken}
        status={state.config}
        onChanged={refresh}
      />

      <SmsEnrollmentCard
        idToken={state.idToken}
        status={state.config}
        onChanged={refresh}
      />
    </div>
  );
}
