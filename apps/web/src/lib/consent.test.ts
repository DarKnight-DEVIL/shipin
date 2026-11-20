import { describe, expect, it } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  buildConsent,
  parseConsent,
  readConsent,
  writeConsent,
} from "./consent";

function memoryStorage(initial?: string): Storage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(CONSENT_STORAGE_KEY, initial);

  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("parseConsent", () => {
  it("accepts a record written for the current policy version", () => {
    const record = buildConsent("accepted", new Date("2026-11-20T10:00:00Z"));

    expect(parseConsent(JSON.stringify(record))).toEqual({
      choice: "accepted",
      version: CONSENT_VERSION,
      decidedAt: "2026-11-20T10:00:00.000Z",
    });
  });

  it("treats the legacy bare string as no decision", () => {
    // The old banner stored exactly this; it must not silently count as consent.
    expect(parseConsent("accepted")).toBeNull();
    expect(parseConsent("declined")).toBeNull();
  });

  it("treats consent to an older disclosure as no decision", () => {
    const stale = { ...buildConsent("accepted"), version: CONSENT_VERSION - 1 };

    expect(parseConsent(JSON.stringify(stale))).toBeNull();
  });

  it("ignores malformed or missing values", () => {
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent("{not json")).toBeNull();
    expect(parseConsent(JSON.stringify({ choice: "yes" }))).toBeNull();
  });
});

describe("storage round trip", () => {
  it("writes and reads back a decision", () => {
    const storage = memoryStorage();
    writeConsent(storage, buildConsent("declined"));

    expect(readConsent(storage)?.choice).toBe("declined");
  });

  it("survives storage that throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;

    expect(readConsent(hostile)).toBeNull();
    expect(() => writeConsent(hostile, buildConsent("accepted"))).not.toThrow();
    expect(readConsent(undefined)).toBeNull();
  });
});
