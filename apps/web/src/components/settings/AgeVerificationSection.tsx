"use client";

import { useEffect, useState } from "react";

import { customerApi } from "@/lib/customerApiClient";
import { auth } from "@/lib/firebase";
import {
  getUserProfile,
  updateUserProfile,
} from "@/features/users/services/userProfile";
import { calculateAge } from "@/lib/compliance/ageVerification";

import SettingsSection from "./SettingsSection";
import { PrimaryButton } from "./SettingsButtons";
import { inputClass, labelClass } from "./settingsStyles";

/*
 * DPDP Act 2023 §9 — age gate and parental consent (docs/AUDIT.md §2.5).
 *
 * The endpoints behind this section (`GET/POST /api/user/age-verification`,
 * the `dateOfBirth` field on `PATCH /api/profile`) already existed and were
 * tested — the missing piece was a UI that calls them, so the gate was
 * dormant: with no date of birth collected anywhere, `enforceAgeGate` always
 * allowed. This section collects the date of birth, shows where the caller
 * stands, and runs the parental-consent flow for under-18 accounts.
 */

const CONSENT_METHODS = [
  { value: "otp", label: "Email code to parent (automated)" },
  { value: "digital_signature", label: "Digital signature" },
  { value: "video_kyc", label: "Video KYC" },
  { value: "aadhaar", label: "Aadhaar" },
] as const;

type ConsentMethod = (typeof CONSENT_METHODS)[number]["value"];

interface AgeVerificationStatus {
  success: boolean;
  parentalConsentVerified: boolean;
  ageGate: { allowed: boolean; error?: string };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AgeVerificationSection() {
  const [loading, setLoading] = useState(true);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [savingDob, setSavingDob] = useState(false);
  const [status, setStatus] = useState<AgeVerificationStatus | null>(null);

  const [parentEmail, setParentEmail] = useState("");
  const [method, setMethod] = useState<ConsentMethod>("otp");
  const [consentId, setConsentId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    const result = await customerApi<AgeVerificationStatus>(
      "/api/user/age-verification",
      { method: "GET" }
    );
    setStatus(result);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const uid = auth.currentUser?.uid;
        const [profile] = await Promise.all([
          uid ? getUserProfile(uid) : Promise.resolve(null),
          refreshStatus(),
        ]);

        if (cancelled) return;

        if (typeof profile?.dateOfBirth === "string") {
          setDateOfBirth(profile.dateOfBirth);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            errorMessage(loadError, "Could not load your verification status.")
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const age = dateOfBirth ? calculateAge(dateOfBirth) : null;
  const needsConsent = Boolean(
    status &&
    !status.parentalConsentVerified &&
    status.ageGate.allowed === false
  );

  async function handleSaveDob() {
    if (!dateOfBirth) {
      setError("Enter your date of birth first.");
      return;
    }

    setSavingDob(true);
    setError(null);
    setMessage(null);

    try {
      if (!auth.currentUser) {
        setError("You need to be signed in.");
        return;
      }

      await updateUserProfile(auth.currentUser.uid, { dateOfBirth });
      await refreshStatus();
      setMessage("Date of birth saved.");
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not save your date of birth."));
    } finally {
      setSavingDob(false);
    }
  }

  async function handleRequestConsent() {
    if (!parentEmail.trim()) {
      setError("Enter the parent's email address.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await customerApi<{
        success: boolean;
        consentId?: string;
        error?: string;
      }>("/api/user/age-verification", {
        method: "POST",
        body: { action: "request", parentEmail: parentEmail.trim(), method },
      });

      if (!result.success) {
        setError(result.error ?? "Could not send the consent request.");
        return;
      }

      if (method === "otp" && result.consentId) {
        setConsentId(result.consentId);
        setMessage(
          "We emailed the parent a 6-digit code. Enter it below to finish."
        );
      } else {
        setMessage(
          "Consent request recorded. We will verify it and update your account."
        );
      }
    } catch (requestError) {
      setError(
        errorMessage(requestError, "Could not send the consent request.")
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    if (!consentId) return;

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from the parent's email.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await customerApi<{ success: boolean; error?: string }>(
        "/api/user/age-verification",
        {
          method: "POST",
          body: { action: "verify-otp", consentId, otp },
        }
      );

      if (!result.success) {
        setError(result.error ?? "Could not verify the code.");
        return;
      }

      setConsentId(null);
      setOtp("");
      await refreshStatus();
      setMessage("Parental consent verified.");
    } catch (verifyError) {
      setError(errorMessage(verifyError, "Could not verify the code."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsSection
      id="age-verification"
      title="Age verification"
      description="Required by the DPDP Act 2023. Accounts of members under 18 need verified parental consent."
    >
      {loading ? (
        <p className="text-[13px] text-[var(--muted)]">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="age-dob">
              Date of birth
            </label>
            <div className="flex items-center gap-2">
              <input
                id="age-dob"
                type="date"
                className={inputClass}
                value={dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setDateOfBirth(event.target.value)}
              />
              <PrimaryButton onClick={handleSaveDob} disabled={savingDob}>
                {savingDob ? "Saving…" : "Save"}
              </PrimaryButton>
            </div>
            {age !== null && (
              <p className="mt-1 text-[12px] text-[var(--muted)]">Age: {age}</p>
            )}
          </div>

          {status?.parentalConsentVerified ? (
            <p className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
              Parental consent verified.
            </p>
          ) : needsConsent ? (
            <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-[13px] text-[var(--foreground)]">
                {status?.ageGate.error ??
                  "Users under 18 require verified parental consent per DPDP Act 2023."}
              </p>

              {consentId ? (
                <div>
                  <label className={labelClass} htmlFor="age-otp">
                    6-digit code from the parent&apos;s email
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="age-otp"
                      className={inputClass}
                      value={otp}
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) =>
                        setOtp(event.target.value.replace(/\D/g, ""))
                      }
                    />
                    <PrimaryButton
                      onClick={handleVerifyOtp}
                      disabled={submitting}
                    >
                      {submitting ? "Verifying…" : "Verify"}
                    </PrimaryButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className={labelClass} htmlFor="age-parent-email">
                      Parent&apos;s email
                    </label>
                    <input
                      id="age-parent-email"
                      type="email"
                      className={inputClass}
                      value={parentEmail}
                      onChange={(event) => setParentEmail(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="age-method">
                      Verification method
                    </label>
                    <select
                      id="age-method"
                      className={inputClass}
                      value={method}
                      onChange={(event) =>
                        setMethod(event.target.value as ConsentMethod)
                      }
                    >
                      {CONSENT_METHODS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <PrimaryButton
                    onClick={handleRequestConsent}
                    disabled={submitting}
                  >
                    {submitting ? "Sending…" : "Request parental consent"}
                  </PrimaryButton>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-[var(--muted)]">
              No consent needed for this account.
            </p>
          )}

          {message && (
            <p className="text-[13px] text-emerald-600 dark:text-emerald-400">
              {message}
            </p>
          )}
          {error && (
            <p className="text-[13px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
