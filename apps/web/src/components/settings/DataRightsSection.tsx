"use client";

import { useEffect, useState } from "react";

import { customerApi } from "@/lib/customerApiClient";
import { PERSONAL_DATA_CATEGORIES } from "@/lib/compliance/dpdp";

import SettingsSection from "./SettingsSection";
import { PrimaryButton } from "./SettingsButtons";
import SwitchRow from "./SwitchRow";
import { inputClass, labelClass } from "./settingsStyles";

/*
 * Self-service data rights (DPDP/GDPR): access & portability via a data
 * download, granular consent management, and a grievance channel. The
 * endpoints behind these controls already existed and were tested — the only
 * missing piece was a UI that calls them (docs/AUDIT.md §2.5).
 */

type CategoryKey = keyof typeof PERSONAL_DATA_CATEGORIES;

const CATEGORIES = (Object.keys(PERSONAL_DATA_CATEGORIES) as CategoryKey[]).map(
  (key) => {
    const value = PERSONAL_DATA_CATEGORIES[key];
    const label = key.charAt(0) + key.slice(1).toLowerCase();
    return { value, label };
  }
);

interface ConsentEntry {
  granted: boolean;
  version: string;
  updatedAt: string;
  method: string;
}

type ConsentState = Record<string, ConsentEntry>;

interface ConsentResponse {
  success: boolean;
  consentState: ConsentState;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function DataRightsSection() {
  const [consentState, setConsentState] = useState<ConsentState | null>(null);
  const [loadingConsent, setLoadingConsent] = useState(true);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [grievanceText, setGrievanceText] = useState("");
  const [submittingGrievance, setSubmittingGrievance] = useState(false);
  const [grievanceMessage, setGrievanceMessage] = useState<string | null>(null);
  const [grievanceError, setGrievanceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConsent() {
      try {
        const response = await customerApi<ConsentResponse>(
          "/api/user/consent",
          { method: "GET" }
        );
        if (!cancelled) setConsentState(response.consentState ?? {});
      } catch (error) {
        if (!cancelled) {
          setConsentState({});
          setGrievanceError(
            errorMessage(error, "We could not load your consent settings.")
          );
        }
      } finally {
        if (!cancelled) setLoadingConsent(false);
      }
    }

    void loadConsent();

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleConsent(category: string, granted: boolean) {
    setSavingCategory(category);
    try {
      await customerApi("/api/user/consent", {
        method: "POST",
        body: {
          category,
          granted,
          version: consentState?.[category]?.version ?? "1",
          method: granted ? "explicit" : "withdrawn",
        },
      });
      setConsentState((previous) => ({
        ...previous,
        [category]: {
          granted,
          version: previous?.[category]?.version ?? "1",
          updatedAt: new Date().toISOString(),
          method: granted ? "explicit" : "withdrawn",
        },
      }));
    } catch (error) {
      setGrievanceError(
        errorMessage(error, "We could not save that consent change.")
      );
    } finally {
      setSavingCategory(null);
    }
  }

  async function downloadData() {
    setDownloading(true);
    setDownloadMessage(null);
    setDownloadError(null);

    try {
      const data = await customerApi<Record<string, unknown>>(
        "/api/user/export",
        { method: "GET" }
      );

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `shipin-data-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setDownloadMessage("Your data export has been downloaded.");
    } catch (error) {
      setDownloadError(
        errorMessage(error, "We could not export your data. Try again later.")
      );
    } finally {
      setDownloading(false);
    }
  }

  async function submitGrievance() {
    const details = grievanceText.trim();
    if (!details) return;

    setSubmittingGrievance(true);
    setGrievanceMessage(null);
    setGrievanceError(null);

    try {
      const response = await customerApi<{
        success: boolean;
        message?: string;
      }>("/api/user/grievance", {
        method: "POST",
        body: { right: "grievance", details },
      });
      setGrievanceText("");
      setGrievanceMessage(
        response.message ??
          "Your request has been submitted. We will respond within 30 days."
      );
    } catch (error) {
      setGrievanceError(
        errorMessage(error, "We could not submit your request. Try again.")
      );
    } finally {
      setSubmittingGrievance(false);
    }
  }

  return (
    <SettingsSection
      id="privacy"
      title="Your data rights"
      description="Download a copy of your data, manage consent, or raise a concern."
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Download a copy of my data
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
            Receive a machine-readable JSON file with the personal data we hold
            about you: your profile, requests, wallet transactions, addresses,
            notifications, support tickets and consent history.
          </p>
          <div className="mt-3">
            <PrimaryButton onClick={downloadData} disabled={downloading}>
              {downloading ? "Preparing export…" : "Download my data"}
            </PrimaryButton>
          </div>
          {downloadMessage && (
            <p role="status" className="mt-2 text-[12px] text-emerald-600">
              {downloadMessage}
            </p>
          )}
          {downloadError && (
            <p role="alert" className="mt-2 text-[12px] text-red-600">
              {downloadError}
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Consent preferences
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
            Choose which categories of processing you consent to. You can
            withdraw consent at any time; every change is recorded.
          </p>
          {loadingConsent ? (
            <p className="mt-3 text-[12px] text-[var(--muted)]">
              Loading your consent settings…
            </p>
          ) : (
            <div className="mt-2 divide-y divide-[var(--border)]">
              {CATEGORIES.map(({ value, label }) => (
                <SwitchRow
                  key={value}
                  label={label}
                  checked={consentState?.[value]?.granted === true}
                  onChange={() =>
                    toggleConsent(
                      value,
                      consentState?.[value]?.granted !== true
                    )
                  }
                />
              ))}
            </div>
          )}
          {savingCategory && (
            <p className="mt-2 text-[12px] text-[var(--muted)]" role="status">
              Saving…
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            Raise a concern
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
            Tell us how you think we have mishandled your personal data and we
            will respond within 30 days.
          </p>
          <label
            className={`${labelClass} mt-3 block`}
            htmlFor="grievance-details"
          >
            What happened?
          </label>
          <textarea
            id="grievance-details"
            value={grievanceText}
            onChange={(event) => setGrievanceText(event.target.value)}
            rows={4}
            className={`${inputClass} w-full`}
            placeholder="Describe your concern"
          />
          <div className="mt-3">
            <PrimaryButton
              onClick={submitGrievance}
              disabled={submittingGrievance || !grievanceText.trim()}
            >
              {submittingGrievance ? "Sending…" : "Submit request"}
            </PrimaryButton>
          </div>
          {grievanceMessage && (
            <p role="status" className="mt-2 text-[12px] text-emerald-600">
              {grievanceMessage}
            </p>
          )}
          {grievanceError && (
            <p role="alert" className="mt-2 text-[12px] text-red-600">
              {grievanceError}
            </p>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
