/**
 * Centralized API client for ShipIN.
 *
 * Wraps fetch with:
 *   - Base URL configuration
 *   - Automatic JSON parsing
 *   - Error handling via ShipINError
 *   - Request/response interceptors
 *   - Automatic Firebase ID token attachment (client-side)
 */

import { toShipINError, serializeError } from '@/utils/errors';

interface ApiClientOptions {
  baseURL?: string;
  timeout?: number;
  /** Optional function to get the current auth token (client-side). */
  getAuthToken?: () => string | null | Promise<string | null>;
}

interface RequestInitWithTimeout extends RequestInit {
  timeout?: number;
}

class ApiClient {
  private baseURL: string;
  private defaultTimeout: number;
  private getAuthToken: () => string | null | Promise<string | null>;

  constructor(options: ApiClientOptions = {}) {
    this.baseURL = options.baseURL ?? '';
    this.defaultTimeout = options.timeout ?? 30000;
    this.getAuthToken = options.getAuthToken ?? (() => null);
  }

  private async request<T>(
    endpoint: string,
    init: RequestInitWithTimeout = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;

    const timeout = init.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Attach auth token if available (client-side only)
    const authToken = await this.getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...init.headers as Record<string, string>,
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = toShipINError({
          message: errorData.error || response.statusText,
          code: errorData.code,
          status: response.status,
          details: errorData.details,
        });
        throw error;
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as unknown as T;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw toShipINError({ message: 'Request timed out.', status: 408 });
      }
      throw toShipINError(error);
    }
  }

  async get<T>(endpoint: string, init?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...init, method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...init,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...init,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...init,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string, init?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...init, method: 'DELETE' });
  }
}

// Default client instance — auth token getter injected by the auth provider on client side.
export const apiClient = new ApiClient();

export function handleApiError(error: unknown): { message: string; status: number } {
  const err = toShipINError(error);
  return { message: err.message, status: err.status };
}