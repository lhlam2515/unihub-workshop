/**
 * Public API façade for the UniHub Web Portal.
 *
 * This file is intentionally thin. All implementation details live in
 * `_internal/`. Consumers should import from `@/lib/api` (the barrel),
 * not directly from this file.
 */

import { API_ROUTES } from "@/constants/api-routes";
import { ApiError } from "@/lib/api/errors";
import type {
  ApiResponse,
  PaginatedData,
  PaginationMeta,
  RequestOptions,
} from "@/lib/api/types";
import { clearSessionToken, setSessionToken } from "@/lib/auth/sync-session";

import { onForcedLogout } from "./auth-session";
import { API_BASE_URL } from "./config";
import { request } from "./http";
import { tokenStore } from "./token-store";

export { onForcedLogout, tokenStore };

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Internal helper: unwrap envelope data
// ---------------------------------------------------------------------------

function unwrap<T>(envelope: ApiResponse<T>): T {
  return (envelope as Extract<typeof envelope, { success: true }>).data;
}

/** Shared implementation for POST / PUT / PATCH (all carry a body). */
async function withBody<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return unwrap(await request<T>(method, path, body, options));
}

// ---------------------------------------------------------------------------
// api — typed HTTP verbs
// ---------------------------------------------------------------------------

export const api = {
  /** GET a single resource and return the unwrapped payload. */
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return unwrap(await request<T>("GET", path, undefined, options));
  },

  /** GET a paginated list and return items with pagination metadata. */
  async getPaginated<T>(
    path: string,
    options?: RequestOptions
  ): Promise<PaginatedResult<T>> {
    const envelope = await request<PaginatedData<T>>(
      "GET",
      path,
      undefined,
      options
    );
    const success = envelope as Extract<typeof envelope, { success: true }>;

    if (!success.pagination) {
      throw new ApiError(200, {
        code: "INTERNAL_ERROR",
        message:
          "Expected paginated response but pagination metadata is missing.",
      });
    }

    return { items: success.data.data, pagination: success.pagination };
  },

  /** POST with an optional body and return the unwrapped payload. */
  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return withBody<T>("POST", path, body, options);
  },

  /** PUT with an optional body and return the unwrapped payload. */
  async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return withBody<T>("PUT", path, body, options);
  },

  /** PATCH with an optional body and return the unwrapped payload. */
  async patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return withBody<T>("PATCH", path, body, options);
  },

  /** DELETE and return the unwrapped payload (defaults to void). */
  async delete<T = void>(path: string, options?: RequestOptions): Promise<T> {
    return unwrap(await request<T>("DELETE", path, undefined, options));
  },
} as const;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Log in, store the returned Access Token in memory, and let the server set
 * the HttpOnly Refresh Token cookie automatically.
 *
 * @throws ApiError on invalid credentials, suspended account, etc.
 */
export async function login<TCredentials, TSession>(
  credentials: TCredentials
): Promise<TSession> {
  const response = await fetch(`${API_BASE_URL}${API_ROUTES.AUTH.LOGIN}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(credentials),
  });

  const envelope = (await response.json()) as ApiResponse<
    TSession & { accessToken: string }
  >;

  if (!envelope.success) {
    throw new ApiError(response.status, envelope.error);
  }

  tokenStore.set(envelope.data.accessToken);
  setSessionToken(envelope.data.accessToken);
  return envelope.data;
}

/**
 * Log out: invalidate the server-side session and clear the in-memory token.
 * The server clears the Refresh Token cookie on its end.
 */
export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } finally {
    tokenStore.clear();
    clearSessionToken();
  }
}
