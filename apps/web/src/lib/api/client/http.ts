/**
 * Core HTTP plumbing: URL building, header injection, response parsing,
 * and the single-retry-on-401 strategy.
 *
 * This module knows nothing about auth business logic — it delegates token
 * acquisition entirely to `auth-session.ts`.
 */

import { ApiError } from "@/lib/api/errors";
import type { ApiResponse, RequestOptions } from "@/lib/api/types";

import { acquireFreshToken } from "./auth-session";
import { API_BASE_URL } from "./config";
import { tokenStore } from "./token-store";


// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

export function buildUrl(
  path: string,
  params?: RequestOptions["params"]
): string {
  const url = new URL(path, API_BASE_URL);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function buildHeaders(token: string | null): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function sendFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: "include" });
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

export async function parseResponse<T>(
  response: Response
): Promise<ApiResponse<T>> {
  let envelope: ApiResponse<T>;

  try {
    envelope = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(response.status, {
      code: "INTERNAL_ERROR",
      message: "Server returned a non-JSON response.",
    });
  }

  if (!envelope.success) {
    throw new ApiError(response.status, envelope.error);
  }

  return envelope;
}

// ---------------------------------------------------------------------------
// 401 retry
// ---------------------------------------------------------------------------

async function retryWithFreshToken<T>(
  url: string,
  init: RequestInit
): Promise<ApiResponse<T>> {
  const freshToken = await acquireFreshToken();
  const retryResponse = await sendFetch(url, {
    ...init,
    headers: buildHeaders(freshToken),
  });
  return parseResponse<T>(retryResponse);
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

/**
 * Execute a typed HTTP request against the API.
 *
 * - Injects the current Access Token as a Bearer header automatically.
 * - On 401, delegates to `acquireFreshToken()` and retries once.
 * - On any other failure, parses the error envelope and throws `ApiError`.
 *
 * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param path - Path relative to `API_BASE_URL`
 * @param body - Optional JSON body
 * @param options - Query params and additional fetch overrides
 * @returns Typed success response envelope
 * @throws ApiError for all non-successful outcomes
 */
export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(path, params);

  const init: RequestInit = {
    ...fetchOptions,
    method,
    headers: buildHeaders(tokenStore.get()),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const response = await sendFetch(url, init);

  if (response.ok) {
    return parseResponse<T>(response);
  }

  if (response.status === 401) {
    return retryWithFreshToken<T>(url, init);
  }

  return parseResponse<T>(response);
}
