/**
 * @fileoverview Shared API client factory for authenticated fetch calls.
 *
 * Both customer and admin clients share ~90% of their logic. This module
 * centralizes the common behavior (token attachment, error normalization,
 * network-error handling) so each variant only differs in its error class
 * and any extra headers it attaches.
 */

import { auth } from "@/lib/firebase";

export interface ApiErrorOptions {
  message: string;
  code: string;
  status: number;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export interface ApiErrorClass {
  new (message: string, code: string, status: number): ApiError;
}

export type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  extraHeaders?: Record<string, string>;
  errorClass?: ApiErrorClass;
};

function createError(
  errorClass: ApiErrorClass,
  message: string,
  code: string,
  status: number
): ApiError {
   
  return new errorClass(message, code, status);
}

export async function apiFetch<T>(
  path: string,
  {
    method = "GET",
    body,
    extraHeaders = {},
    errorClass = ApiError,
  }: ApiOptions = {}
): Promise<T> {
  const user = auth.currentUser;

  if (!user) {
    throw createError(errorClass, "You are signed out. Sign in again.", "AUTHENTICATION_REQUIRED", 401);
  }

  const idToken = await user.getIdToken();

  let response: Response;

  try {
    response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw createError(errorClass, "Could not reach the server.", "NETWORK_ERROR", 0);
  }

  let payload: Record<string, unknown> = {};

  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok || payload.success === false) {
    throw createError(
      errorClass,
      typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status}).`,
      typeof payload.code === "string" ? payload.code : "UNKNOWN_ERROR",
      response.status
    );
  }

  return payload as T;
}