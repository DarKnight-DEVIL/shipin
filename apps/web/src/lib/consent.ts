/**
 * Cookie/consent record kept in the browser.
 *
 * The old banner wrote the bare string `"accepted"` and read it back, so a
 * policy change could not invalidate old consent and there was no record of
 * *when* someone agreed. This stores a small versioned record instead, and any
 * unreadable or outdated value counts as "no decision yet".
 */

export const CONSENT_STORAGE_KEY = "cookie-consent";

/** Bump when the banner's disclosure changes materially. */
export const CONSENT_VERSION = 2;

export type ConsentChoice = "accepted" | "declined";

export interface ConsentRecord {
  choice: ConsentChoice;
  version: number;
  /** ISO timestamp of the decision. */
  decidedAt: string;
}

function isConsentRecord(value: unknown): value is ConsentRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ConsentRecord>;

  return (
    (record.choice === "accepted" || record.choice === "declined") &&
    typeof record.version === "number" &&
    typeof record.decidedAt === "string"
  );
}

/** Parses a stored value; anything unrecognised means "ask again". */
export function parseConsent(raw: string | null): ConsentRecord | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isConsentRecord(parsed)) return null;
    // Consent to an older disclosure is not consent to the current one.
    return parsed.version === CONSENT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function buildConsent(
  choice: ConsentChoice,
  now: Date = new Date()
): ConsentRecord {
  return {
    choice,
    version: CONSENT_VERSION,
    decidedAt: now.toISOString(),
  };
}

/** localStorage access that cannot throw (Safari private mode, disabled storage). */
export function readConsent(storage: Storage | undefined): ConsentRecord | null {
  if (!storage) return null;

  try {
    return parseConsent(storage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeConsent(storage: Storage | undefined, record: ConsentRecord) {
  if (!storage) return;

  try {
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage full or blocked: the banner simply shows again next visit.
  }
}

/** Event other components (the footer control) use to reopen the banner. */
export const CONSENT_OPEN_EVENT = "shipin:open-cookie-consent";

export function requestConsentBanner() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
