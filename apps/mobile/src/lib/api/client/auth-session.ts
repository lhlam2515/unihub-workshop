/**
 * Silent Refresh, Thundering Herd Mutex, and Forced Logout for React Native.
 *
 * Responsibilities (only these, nothing else):
 * 1. Execute the /auth/refresh call exactly once when Access Token expires.
 * 2. Queue concurrent 401 requests behind a mutex so only one refresh fires.
 * 3. Notify the application when the Refresh Token is also invalid (force logout).
 *
 * Key differences from Web version:
 * - Refresh Token is sent explicitly via request body (no cookies on RN).
 * - Backend always rotates RT → both AT + RT are persisted via `setTokens()`.
 * - Forced logout uses `expo-router` directly (no callback registration needed).
 */

import { router } from "expo-router";

import { API_ROUTES } from "@/constants/api-routes";
import { ApiError, isRefreshTokenError } from "@/lib/api/errors";
import type { ApiResponse } from "@/lib/api/types";

import { API_BASE_URL } from "./config";
import { tokenStore } from "./token-store";

// ---------------------------------------------------------------------------
// Forced logout
// ---------------------------------------------------------------------------

function triggerForcedLogout(): void {
  // Fire-and-forget: clear is async but we redirect immediately
  tokenStore.clear();
  router.replace("/login");
}

// ---------------------------------------------------------------------------
// Mutex queue
// ---------------------------------------------------------------------------

let _isRefreshing = false;
let _refreshQueue: {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}[] = [];

function flushRefreshQueue(token: string): void {
  _refreshQueue.forEach(({ resolve }) => resolve(token));
  _refreshQueue = [];
}

function rejectRefreshQueue(err: unknown): void {
  _refreshQueue.forEach(({ reject }) => reject(err));
  _refreshQueue = [];
}

// ---------------------------------------------------------------------------
// Refresh call — sends RT explicitly via body
// ---------------------------------------------------------------------------

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    throw new ApiError(401, {
      code: "REFRESH_TOKEN_INVALID",
      message: "No refresh token available.",
    });
  }

  const response = await fetch(`${API_BASE_URL}${API_ROUTES.AUTH.REFRESH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  const envelope = (await response.json()) as ApiResponse<{
    accessToken: string;
    refreshToken: string; // BE always rotates RT (confirmed)
  }>;

  if (!envelope.success) {
    throw new ApiError(response.status, envelope.error);
  }

  const { accessToken, refreshToken: newRT } = envelope.data;

  // BE luôn rotate RT → lưu cả cặp AT + RT mới
  await tokenStore.setTokens(accessToken, newRT);

  return accessToken;
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
