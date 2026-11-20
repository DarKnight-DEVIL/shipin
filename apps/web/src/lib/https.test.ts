import { describe, expect, it } from "vitest";
import { isInsecureRequest } from "./https";

describe("isInsecureRequest", () => {
  it("flags an http request forwarded by a TLS-terminating proxy", () => {
    expect(isInsecureRequest("http")).toBe(true);
    expect(isInsecureRequest("http, https")).toBe(true);
    expect(isInsecureRequest("  HTTP  ")).toBe(true);
  });

  it("leaves https and absent headers alone", () => {
    expect(isInsecureRequest("https")).toBe(false);
    expect(isInsecureRequest("https, http")).toBe(false);
    expect(isInsecureRequest("")).toBe(false);
    expect(isInsecureRequest(null)).toBe(false);
    expect(isInsecureRequest(undefined)).toBe(false);
  });
});
