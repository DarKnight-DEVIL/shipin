import { describe, expect, it } from "vitest";
import { isInsecureRequest, isLoopbackHost } from "./https";

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

describe("isLoopbackHost", () => {
  it("recognises every spelling of the local machine", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("LocalHost")).toBe(true);
    expect(isLoopbackHost("app.localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.1.2.3")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(true);
  });

  it("treats real hosts as public", () => {
    expect(isLoopbackHost("shipin-psi.vercel.app")).toBe(false);
    expect(isLoopbackHost("shipin.co")).toBe(false);
    expect(isLoopbackHost("127.0.0.1.example.com")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
  });
});
