/**
 * Silent Refresh, Thundering Herd Mutex, and Forced Logout.
 *
 * Responsibilities (only these, nothing else):
 * 1. Execute the /auth/refresh call exactly once when Access Token expires.
 * 2. Queue concurrent 401 requests behind a mutex so only one refresh fires.
 * 3. Notify the application when the Refresh Token is also invalid (force logout).
 */

import { ApiError, isRefreshTokenError } from "@/lib/api/errors";
import type { ApiResponse } from "@/lib/api/types";

import { API_BASE_URL } from "./config";
import { tokenStore } from "./token-store";

// ---------------------------------------------------------------------------
// Forced logout hook
// ---------------------------------------------------------------------------

let _forcedLogoutHandler: (() => void) | null = null;

/**
 * Register a callback that is invoked when authentication cannot be recovered.
 *
 * Call this once at the application root (e.g., in a Next.js layout or
 * provider) to redirect the user to the login screen and reset app state.
 *
 * @example
 * ```ts
 * onForcedLogout(() => router.push('/login'));
 * ```
 */
export function onForcedLogout(handler: () => void): void {
  _forcedLogoutHandler = handler;
}

function triggerForcedLogout(): void {
  tokenStore.clear();
  _forcedLogoutHandler?.();
}

// ---------------------------------------------------------------------------
// Mutex queue
// ---------------------------------------------------------------------------

let _isRefreshing = false;
let _refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function flushRefreshQueue(token: string): void {
  _refreshQueue.forEach(({ resolve }) => resolve(token));
  _refreshQueue = [];
}

function rejectRefreshQueue(err: unknown): void {
  _refreshQueue.forEach(({ reject }) => reject(err));
  _refreshQueue = [];
}

// ---------------------------------------------------------------------------
// Refresh call
// ---------------------------------------------------------------------------

async function refreshAccessToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  const envelope = (await response.json()) as ApiResponse<{
    accessToken: string;
  }>;

  if (!envelope.success) {
    throw new ApiError(response.status, envelope.error);
  }

  return envelope.data.accessToken;
}

// ---------------------------------------------------------------------------
// Public: serialized token acquisition
// ---------------------------------------------------------------------------

/**
 * Acquire a fresh Access Token while ensuring only one refresh call is
 * in-flight at a time (Thundering Herd protection).
 *
 * - If a refresh is already in progress, the caller is queued until it settles.
 * - If the Refresh Token is invalid, `triggerForcedLogout` is called before
 *   the error is re-thrown.
 *
 * @returns The new Access Token string
 * @throws ApiError when the Refresh Token is invalid or expired
 */
export async function acquireFreshToken(): Promise<string> {
  if (_isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      _refreshQueue.push({ resolve, reject });
    });
  }

  _isRefreshing = true;

  try {
    const newToken = await refreshAccessToken();
    tokenStore.set(newToken);
    flushRefreshQueue(newToken);
    return newToken;
  } catch (err) {
    rejectRefreshQueue(err);
    if (isRefreshTokenError(err)) {
      triggerForcedLogout();
    }
    throw err;
  } finally {
    _isRefreshing = false;
  }
}
