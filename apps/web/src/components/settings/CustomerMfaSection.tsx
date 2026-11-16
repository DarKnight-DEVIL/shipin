"use client";

/**
 * Customer two-factor authentication settings.
 *
 * Self-contained: loads the caller's MFA status from
 * /api/auth/mfa/status and drives the standard enrollment endpoints
 * (TOTP, backup codes, SMS, security keys). Every call is authenticated
 * with the signed-in customer's Firebase ID token.
 */

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { MfaApiError } from "@/lib/mfaApi";
import {
  beginTotpEnrollment,
  confirmSmsCode,
  confirmTotpEnrollment,
  getMfaConfigStatus,
  regenerateBackupCodes,
  sendSmsCode,
  type MfaConfigStatus,
} from "@/lib/mfaSetupClient";
import {
  WebAuthnCeremonyError,
  completeSecurityKeyRegistration,
  isWebAuthnSupported,
  registerSecurityKey,
  removeSecurityKey,
} from "@/lib/webauthnClient";

const E164 = /^\+[1-9]\d{1,14}$/;

const cardClass = "rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-4";
const titleClass = "text-[13px] font-semibold text-[var(--foreground)]";
const hintClass = "mt-1 text-[12px] leading-5 text-[var(--muted)]";
const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-red-500";
const primaryBtn =
  "rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-3,rgba(148,163,184,0.18))] disabled:cursor-not-allowed disabled:opacity-60";

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof MfaApiError || caught instanceof WebAuthnCeremonyError) {
    return caught.message;
  }
  if (caught instanceof Error && caught.message) return caught.message;
  return fallback;
}

export default function CustomerMfaSection() {
  const [status, setStatus] = useState<MfaConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // TOTP
  const [totpSecret, setTotpSecret] = useState("");
  const [totpQr, setTotpQr] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [freshCodes, setFreshCodes] = useState<string[]>([]);

  // SMS
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsPending, setSmsPending] = useState(false);

  // Security key
  const [keyName, setKeyName] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = auth.currentUser;

    if (!user) {
      setError("Sign in to manage two-factor authentication.");
      setLoading(false);
      return;
    }

    try {
      const idToken = await user.getIdToken();
      setStatus(await getMfaConfigStatus(idToken));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not load your security settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe rather than reading auth in the effect body: the callback also
  // fires on sign-in, so the panel reloads for the right account.
  useEffect(() => onAuthStateChanged(auth, () => void load()), [load]);

  async function withToken(action: string, run: (idToken: string) => Promise<void>) {
    const user = auth.currentUser;

    if (!user) {
      setError("Sign in to manage two-factor authentication.");
      return;
    }

    setBusy(action);
    setError(null);
    setMessage(null);

    try {
      await run(await user.getIdToken());
    } catch (caught) {
      setError(errorMessage(caught, "That did not work. Try again."));
    } finally {
      setBusy(null);
    }
  }

  function startTotp() {
    void withToken("totp-start", async (idToken) => {
      const { secret, qrDataUrl } = await beginTotpEnrollment(idToken);

      if (!secret) {
        setError("The server did not return a setup key. Try again.");
        return;
      }

      setTotpSecret(secret);
      setTotpQr(qrDataUrl);
      setTotpCode("");
      setFreshCodes([]);
    });
  }

  function submitTotp(event: React.FormEvent) {
    event.preventDefault();

    void withToken("totp-verify", async (idToken) => {
      const codes = await confirmTotpEnrollment(idToken, totpCode.trim());

      setFreshCodes(codes);
      setTotpCode("");
      setTotpSecret("");
      setTotpQr("");
      setMessage("Authenticator enabled.");
      await load();
    });
  }

  function submitPhone(event: React.FormEvent) {
    event.preventDefault();

    const value = phone.trim();

    if (!E164.test(value)) {
      setError("Use international format, for example +15551234567.");
      return;
    }

    void withToken("sms-send", async (idToken) => {
      const reply = await sendSmsCode(idToken, value);
      setSmsPending(true);
      setSmsCode("");
      setMessage(reply);
    });
  }

  function submitSmsCode(event: React.FormEvent) {
    event.preventDefault();

    void withToken("sms-verify", async (idToken) => {
      const reply = await confirmSmsCode(idToken, smsCode.trim());
      setSmsPending(false);
      setSmsCode("");
      setPhone("");
      setMessage(reply);
      await load();
    });
  }

  function addSecurityKey(event: React.FormEvent) {
    event.preventDefault();

    if (!isWebAuthnSupported()) {
      setError("This browser does not support security keys. Use a current browser over HTTPS.");
      return;
    }

    const name = keyName.trim() || "Security key";

    void withToken("webauthn-add", async (idToken) => {
      const credential = await registerSecurityKey(idToken, name);
      await completeSecurityKeyRegistration(idToken, credential, name);
      setKeyName("");
      setMessage("Security key added.");
      await load();
    });
  }

  function deleteSecurityKey(id: string) {
    const remaining = status?.webauthn.credentials.length ?? 0;
    const otherFactors =
      (status?.totp.enabled ? 1 : 0) + (status?.sms.enabled ? 1 : 0);

    if (remaining <= 1 && otherFactors === 0) {
      setError("Add another factor before removing your only second factor.");
      return;
    }

    void withToken("webauthn-remove", async (idToken) => {
      await removeSecurityKey(idToken, id);
      setPendingRemoval(null);
      setMessage("Security key removed.");
      await load();
    });
  }

  function regenerate(event: React.FormEvent) {
    event.preventDefault();

    void withToken("backup", async (idToken) => {
      const codes = await regenerateBackupCodes(idToken, totpCode.trim());
      setFreshCodes(codes);
      setTotpCode("");
      setMessage("New backup codes generated.");
      await load();
    });
  }

  const configured = status
    ? [
        status.totp.enabled ? "Authenticator" : null,
        status.sms.enabled ? "SMS" : null,
        status.webauthn.enabled ? "Security key" : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="mt-8 space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
          Two-factor authentication
        </h3>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          {loading
            ? "Loading your second factors…"
            : configured.length > 0
              ? `Active: ${configured.join(", ")}.`
              : "No second factor is set up yet. Add one below."}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-[12px] text-rose-500">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
          {message}
        </p>
      ) : null}

      {freshCodes.length > 0 ? (
        <div className={cardClass}>
          <p className={titleClass}>Save these backup codes now</p>
          <p className={hintClass}>
            Shown once. Each code works a single time if your other factors are
            unavailable.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-[12px] text-[var(--foreground)] sm:grid-cols-3">
            {freshCodes.map((code) => (
              <li key={code} className="rounded-lg bg-[var(--surface-1)] px-3 py-2 text-center tracking-wider">
                {code}
              </li>
            ))}
          </ul>
          <button type="button" className={`${secondaryBtn} mt-3`} onClick={() => setFreshCodes([])}>
            I saved them
          </button>
        </div>
      ) : null}

      {/* TOTP ------------------------------------------------------------- */}
      <div className={cardClass}>
        <p className={titleClass}>Authenticator app</p>
        <p className={hintClass}>
          Six-digit codes from Google Authenticator, 1Password, Authy or any
          standard TOTP app.
        </p>

        {totpSecret ? (
          <form onSubmit={submitTotp} className="mt-3 space-y-3">
            <div className="flex flex-wrap items-start gap-4">
              <div className="rounded-lg bg-white p-2">
                {totpQr ? (
                  // Server-rendered PNG data URL.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={totpQr} alt="QR code for authenticator setup" width={150} height={150} />
                ) : (
                  <p className="w-[150px] text-center text-[11px] text-slate-600">
                    QR unavailable — enter the key manually.
                  </p>
                )}
              </div>
              <div className="min-w-[200px] flex-1">
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Or enter this key
                </p>
                <code className="mt-1 block break-all rounded-lg bg-[var(--surface-1)] px-2 py-1.5 font-mono text-[11px] text-[var(--foreground)]">
                  {totpSecret}
                </code>
              </div>
            </div>

            <input
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={inputClass}
            />

            <div className="flex flex-wrap gap-2">
              <button type="submit" className={primaryBtn} disabled={busy !== null || totpCode.length !== 6}>
                {busy === "totp-verify" ? "Verifying…" : "Verify and enable"}
              </button>
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => {
                  setTotpSecret("");
                  setTotpQr("");
                  setTotpCode("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className={`${primaryBtn} mt-3`}
            onClick={startTotp}
            disabled={busy !== null}
          >
            {busy === "totp-start"
              ? "Starting…"
              : status?.totp.enabled
                ? "Re-enroll authenticator"
                : "Set up authenticator"}
          </button>
        )}
      </div>

      {/* Backup codes ----------------------------------------------------- */}
      <div className={cardClass}>
        <p className={titleClass}>Backup codes</p>
        <p className={hintClass}>
          {status?.backupCodes
            ? `${status.backupCodes} unused code(s) left. Generating a new set invalidates the old ones.`
            : "Backup codes are issued when you enable an authenticator app."}
        </p>

        {status?.totp.enabled ? (
          <form onSubmit={regenerate} className="mt-3 flex flex-wrap gap-2">
            <input
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
              placeholder="Current 6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={`${inputClass} max-w-[220px]`}
            />
            <button type="submit" className={secondaryBtn} disabled={busy !== null || totpCode.length !== 6}>
              {busy === "backup" ? "Generating…" : "Generate new codes"}
            </button>
          </form>
        ) : null}
      </div>

      {/* Security key ----------------------------------------------------- */}
      <div className={cardClass}>
        <p className={titleClass}>Security key or passkey</p>
        <p className={hintClass}>
          A hardware key or the passkey built into this device. Requires a
          WebAuthn-capable browser over HTTPS.
        </p>

        {status?.webauthn.credentials.length ? (
          <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {status.webauthn.credentials.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-[12px] text-[var(--foreground)]">{key.name}</span>
                {pendingRemoval === key.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white"
                      onClick={() => deleteSecurityKey(key.id)}
                      disabled={busy !== null}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className={secondaryBtn}
                      onClick={() => setPendingRemoval(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => setPendingRemoval(key.id)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <form onSubmit={addSecurityKey} className="mt-3 flex flex-wrap gap-2">
          <input
            value={keyName}
            onChange={(event) => setKeyName(event.target.value)}
            placeholder="Key name (e.g. YubiKey)"
            maxLength={60}
            className={`${inputClass} max-w-[240px]`}
          />
          <button type="submit" className={secondaryBtn} disabled={busy !== null || !keyName.trim()}>
            {busy === "webauthn-add" ? "Waiting for key…" : "Add security key"}
          </button>
        </form>
      </div>

      {/* SMS -------------------------------------------------------------- */}
      <div className={cardClass}>
        <p className={titleClass}>SMS codes</p>
        <p className={hintClass}>
          A six-digit code by text message. Weaker than an app-based code, but
          useful as a fallback.
          {status?.sms.enabled && status.sms.phoneNumber
            ? ` Currently enabled for ${status.sms.phoneNumber}.`
            : ""}
        </p>

        {smsPending ? (
          <form onSubmit={submitSmsCode} className="mt-3 flex flex-wrap gap-2">
            <input
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={`${inputClass} max-w-[160px]`}
            />
            <button type="submit" className={primaryBtn} disabled={busy !== null || smsCode.length !== 6}>
              {busy === "sms-verify" ? "Verifying…" : "Verify and enable"}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setSmsPending(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <form onSubmit={submitPhone} className="mt-3 flex flex-wrap gap-2">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+15551234567"
              inputMode="tel"
              autoComplete="tel"
              className={`${inputClass} max-w-[240px]`}
            />
            <button type="submit" className={secondaryBtn} disabled={busy !== null}>
              {busy === "sms-send" ? "Sending…" : "Send code"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
