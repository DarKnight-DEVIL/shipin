import { describe, expect, it } from "vitest";

import { credentialUsableHere, resolveRpID } from "./webauthn";

/**
 * An RP ID can be a parent of the origin, and that is the whole point of
 * `WEBAUTHN_RP_ID`: `shipin.com` lets one passkey work on `app.shipin.com`,
 * `track.shipin.com` and every future subdomain, so moving a deployment stops
 * meaning "everyone re-enrols". Everything else is refused, because each of those
 * values would promise a credential that can never be created.
 */
describe("resolveRpID", () => {
  it("defaults to APP_URL's hostname", () => {
    expect(resolveRpID("https://shipin.app")).toBe("shipin.app");
    expect(resolveRpID("http://localhost:3000")).toBe("localhost");
  });

  it("accepts the origin's own hostname", () => {
    expect(resolveRpID("https://app.shipin.com", "app.shipin.com")).toBe(
      "app.shipin.com"
    );
  });

  it("accepts a parent domain, so subdomains can move", () => {
    expect(resolveRpID("https://app.shipin.com", "shipin.com")).toBe(
      "shipin.com"
    );
    expect(resolveRpID("https://shipin.com", "shipin.com")).toBe("shipin.com");
    expect(resolveRpID("https://a.b.shipin.com", "shipin.com")).toBe(
      "shipin.com"
    );
  });

  it("compares by labels, not by string suffix", () => {
    // `notshipin.com` ends with "shipin.com" as characters and is a different domain.
    expect(() => resolveRpID("https://notshipin.com", "shipin.com")).toThrow(
      /not a parent domain/
    );
  });

  it("refuses a domain the origin is not under", () => {
    expect(() =>
      resolveRpID("https://app.shipin.com", "evil.example")
    ).toThrow(/not a parent domain/);
  });

  it("refuses a shared hosting domain", () => {
    // Registering under `vercel.app` would let any other project on it ask for
    // the same credentials.
    expect(() => resolveRpID("https://shipin.vercel.app", "vercel.app")).toThrow(
      /shared hosting domain/
    );
  });

  it("refuses a public suffix", () => {
    expect(() => resolveRpID("https://shipin.com", "com")).toThrow(
      /public suffix/
    );
  });

  it("refuses an IP address", () => {
    // Browsers do not issue passkeys at an IP origin, so this could never work.
    expect(() => resolveRpID("https://192.168.1.10", "192.168.1.10")).toThrow(
      /IP address/
    );
    expect(() => resolveRpID("http://127.0.0.1:3000", "127.0.0.1")).toThrow(
      /IP address/
    );
  });

  it("refuses anything that is not a bare hostname", () => {
    for (const value of [
      "https://shipin.com",
      "shipin.com/path",
      "shipin.com:443",
    ]) {
      expect(() => resolveRpID("https://shipin.com", value)).toThrow(
        /bare hostname/
      );
    }
  });

  it("ignores case and surrounding space", () => {
    expect(resolveRpID("https://app.shipin.com", "  ShipIN.com  ")).toBe(
      "shipin.com"
    );
  });
});

describe("credentialUsableHere", () => {
  const base = {
    credentialID: "cred-1",
    publicKey: "pk-1",
    counter: 1,
    transports: [],
    name: "YubiKey",
    createdAt: 1,
  };

  it("accepts a credential with no tag", () => {
    // Enrolled before the tag existed: it belongs to whatever this deployment uses,
    // and this deployment has not moved.
    expect(credentialUsableHere(base, "shipin.app")).toBe(true);
  });

  it("accepts a credential enrolled for the current RP ID", () => {
    expect(credentialUsableHere({ ...base, rpID: "shipin.app" }, "shipin.app")).toBe(
      true
    );
  });

  it("refuses a credential enrolled for another domain", () => {
    expect(credentialUsableHere({ ...base, rpID: "old.example" }, "shipin.app")).toBe(
      false
    );
  });
});
