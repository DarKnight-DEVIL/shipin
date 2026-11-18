/**
 * Sign-in helpers for API-level E2E specs.
 *
 * The money-path routes authenticate with a Firebase ID token, so an anonymous
 * request only ever proves the 401. When the Auth emulator is running
 * (`npm run test:e2e:local -- --signed-in`), these helpers mint a real token
 * through the emulator's REST API — no browser, no mocks — so a spec can reach
 * the validation and authorization branches too.
 *
 * Nothing here touches PayPal: every spec that uses a token stops at input
 * validation or an unknown fixture id.
 */
import type { APIRequestContext } from "@playwright/test";

const EMULATOR_HOST = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "";
const API_KEY = process.env.E2E_FIREBASE_API_KEY || "fake-api-key";

/** True when the Auth emulator is reachable, i.e. the run is `--signed-in`. */
export function hasEmulatorAuth(): boolean {
  return EMULATOR_HOST.length > 0;
}

function identityUrl(path: string): string {
  return `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/${path}?key=${API_KEY}`;
}

interface IdentityResponse {
  idToken?: string;
  localId?: string;
  error?: { message?: string };
}

async function callIdentity(
  request: APIRequestContext,
  path: string,
  body: Record<string, unknown>
): Promise<IdentityResponse> {
  const response = await request.post(identityUrl(path), { data: body });
  return (await response.json()) as IdentityResponse;
}

/** ID token for an existing emulator account, or null when it does not exist. */
export async function signIn(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string | null> {
  const result = await callIdentity(request, "accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });

  return result.idToken ?? null;
}

/** Create an emulator account and return its ID token. */
export async function signUp(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string | null> {
  const result = await callIdentity(request, "accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });

  return result.idToken ?? null;
}

/** Bearer header for an emulator account, or null when sign-in failed. */
export function bearer(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
