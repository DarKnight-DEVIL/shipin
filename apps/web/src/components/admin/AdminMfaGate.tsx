"use client";

/**
 * Admin MFA elevation banner.
 *
 * Admin API routes require proof of MFA. Instead of sending a code with every
 * request, this component lets an administrator verify once and receive a
 * short-lived session cookie (see /api/auth/mfa/session).
 *
 * Deliberately non-blocking: the admin UI keeps working while the banner is
 * shown, so an elevated session becomes an upgrade rather than a hard gate.
 */

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { getMfaSessionStatus, startMfaSession, startWebAuthnSession } from "@/lib/mfaSessionClient";
import {
  assertSecurityKey,
  isWebAuthnSupported,
  WebAuthnCeremonyError,
} from "@/lib/webauthnClient";
import { MfaApiError } from "@/lib/mfaApi";

import type { MfaMethod } from "@/lib/mfaProof";

/** The only part of the Firebase user this component needs. */
type MfaUser = { getIdToken: () => Promise<string> };

type GateStatus =
  | "checking"
  | "elevated"
  | "needs-code"
  | "not-configured"
  | "unsupported"
  | "signed-out";

const METHOD_LABELS: Record<MfaMethod, string> = {
  totp: "Authenticator app",
  backup: "Backup code",
  sms: "SMS code",
  webauthn: "Security key",
};

/** WebAuthn has no typed code, so only code methods have a placeholder. */
const METHOD_PLACEHOLDERS: Partial<Record<MfaMethod, string>> = {
  totp: "6-digit code",
  backup: "XXXX-XXXX",
  sms: "6-digit code",
};

function isCodeMethod(method: MfaMethod): boolean {
  return method !== "webauthn";
}

export default function AdminMfaGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MfaUser | null>(null);
  const [status, setStatus] = useState<GateStatus>("checking");
  const [methods, setMethods] = useState<MfaMethod[]>([]);
  const [method, setMethod] = useState<MfaMethod>("totp");
  const [code, setCode] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Load MFA session status from the server. */
  const loadStatus = async (current: MfaUser | null) => {
    if (!current) {
      setStatus("signed-out");
      return;
    }

    try {
      const idToken = await current.getIdToken();
      const result = await getMfaSessionStatus(idToken);

      setMethods(result.methods);

      if (result.elevated) {
        setStatus("elevated");
        setFormOpen(false);
        setCode("");
        return;
      }

      if (result.methods.length === 0) {
        setStatus("not-configured");
        return;
      }

      // A security-key-only account in a browser without WebAuthn cannot be
      // elevated here; say so instead of showing a ceremony that cannot run.
      const hasUsableMethod = result.methods.some(
        (candidate) => candidate !== "webauthn" || isWebAuthnSupported()
      );

      if (!hasUsableMethod) {
        setStatus("unsupported");
        return;
      }

      setStatus("needs-code");

      const preferred =
        result.methods.find((candidate) => candidate !== "webauthn") ??
        result.methods[0];

      if (preferred) setMethod(preferred);
    } catch (requestError) {
      if (
        requestError instanceof MfaApiError &&
        (requestError.code === "ADMIN_ACCESS_REQUIRED" ||
          requestError.code === "USER_PROFILE_NOT_FOUND")
      ) {
        // Not an admin: AdminGuard owns that decision.
        setStatus("signed-out");
        return;
      }

      setStatus("needs-code");
      setError("Could not check verification status. Try again.");
    }
  };

  /** Bootstrap status on auth state change. */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      setUser(next);
      void loadStatus(next);
    });

    return unsubscribe;
  }, []);

  /** Reset the form when it is closed or reopened. */
  function openForm() {
    setError(null);
    setCode("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setCode("");
  }

  /** Run the security-key ceremony, then exchange the assertion for a session. */
  async function verifyWithSecurityKey() {
    if (submitting || !user) return;

    setSubmitting(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const assertion = await assertSecurityKey(idToken);
      await startWebAuthnSession(idToken, assertion);

      setStatus("elevated");
      setFormOpen(false);
      setCode("");
    } catch (ceremonyError) {
      setError(
        ceremonyError instanceof WebAuthnCeremonyError
          ? ceremonyError.message
          : "Security key verification failed. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** Submit a typed code (TOTP, backup, SMS) for an elevated session. */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (submitting) return;

    const trimmed = code.trim();

    if (!user) {
      setStatus("signed-out");
      return;
    }

    if (!trimmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      await startMfaSession(idToken, method, trimmed);

      setStatus("elevated");
      setFormOpen(false);
      setCode("");
    } catch (requestError) {
      setError(
        requestError instanceof MfaApiError
          ? requestError.message
          : "Verification failed. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canElevate = status === "needs-code" || status === "not-configured";

  return (
    <>
      {/* Elevation banner */}
      <div className="p-4 rounded-md mb-6 border">
        <div className="flex items-center justify-between">
          <span>
            {status === "elevated"
              ? "Elevated — Admin APIs available"
              : status === "needs-code"
                ? "Verify with your second factor to unlock admin actions"
                : status === "not-configured"
                  ? "No MFA method configured"
                  : status === "unsupported"
                    ? "Unsupported MFA method in this browser"
                    : status === "signed-out"
                      ? "Not signed in as admin"
                      : "Checking verification status…"}
          </span>

          {canElevate && !formOpen ? (
            <button
              type="button"
              onClick={openForm}
              className="text-sm text-blue-600 underline cursor-pointer"
            >
              Verify
            </button>
          ) : null}
        </div>
      </div>

      {status === "elevated" && <ShieldCheck className="mt-2 text-green-500" />}

      {formOpen && status === "needs-code" ? (
        <div className="p-6 rounded-md mb-6 border">
          <h3 className="font-medium mb-4">Verify your identity</h3>

          <p className="text-sm mb-6">{METHOD_LABELS[method]}</p>

          {methods.length > 1 ? (
            <div className="flex gap-3 mb-4">
              {methods.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => {
                    setMethod(candidate);
                    setCode("");
                    setError(null);
                  }}
                  className={`px-3 py-1 text-sm rounded ${
                    method === candidate
                      ? "bg-blue-100 text-blue-800"
                      : "text-gray-700"
                  }`}
                >
                  {METHOD_LABELS[candidate]}
                </button>
              ))}
            </div>
          ) : null}

          {isCodeMethod(method) ? (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm mb-2" htmlFor="mfa-code">
                  Verification code
                  {METHOD_PLACEHOLDERS[method] ? (
                    <span className="text-gray-500">
                      {" "}
                      ({METHOD_PLACEHOLDERS[method]})
                    </span>
                  ) : null}
                </label>
                <input
                  id="mfa-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={METHOD_PLACEHOLDERS[method] ?? ""}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  className="w-full p-2 border rounded"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || !code.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 bg-gray-200 rounded"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={verifyWithSecurityKey}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
              >
                Use security key
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 bg-gray-200 rounded"
              >
                Cancel
              </button>
            </div>
          )}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}

      {status === "unsupported" ? (
        <div className="p-4 rounded-md mb-6 border-red-200">
          <p className="text-sm text-red-600">
            This browser does not support WebAuthn, which this account uses for
            MFA. Use a current browser to elevate your session.
          </p>
        </div>
      ) : null}

      {children}
    </>
  );
}
