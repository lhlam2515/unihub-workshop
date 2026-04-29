/**
 * Hybrid Memory + Secure Storage token store for React Native.
 *
 * Strategy:
 * - **Memory cache** (`_accessToken`, `_refreshToken`): Synchronous reads via
 *   `get()` / `getRefreshToken()` — zero overhead on every API call.
 * - **SecureStore**: Persistent, OS-encrypted (Keychain on iOS, Keystore on
 *   Android) — survives app kills and cold starts.
 *
 * Usage:
 * 1. Call `tokenStore.init()` once in the root `_layout.tsx` before any API call.
 * 2. Use `tokenStore.get()` (sync) for reading the Access Token in `buildHeaders()`.
 * 3. Use `tokenStore.setTokens()` after login or token refresh to persist both.
 * 4. Use `tokenStore.clear()` on logout or forced logout.
 *
 * Security note:
 * - expo-secure-store has a ~2048 byte limit per value on some Android devices.
 *   For JWT payloads with many `allowed_workshop_ids`, monitor token size.
 *   Fallback: store AT in AsyncStorage, keep RT in SecureStore.
 */

import * as SecureStore from "expo-secure-store";

const AT_KEY = "UNIHUB_ACCESS_TOKEN";
const RT_KEY = "UNIHUB_REFRESH_TOKEN";

// ── Memory Cache (synchronous read) ──────────────────────────────────────────
let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export const tokenStore = {
  /**
   * Bootstrap from SecureStore on app cold start.
   * MUST be called once in the root `_layout.tsx` before any API call.
   */
  init: async (): Promise<void> => {
    _accessToken = await SecureStore.getItemAsync(AT_KEY);
    _refreshToken = await SecureStore.getItemAsync(RT_KEY);
  },

  /** Synchronous read — safe for `buildHeaders()` hot path. */
  get: (): string | null => _accessToken,

  /** Synchronous read of Refresh Token for `auth-session.ts`. */
  getRefreshToken: (): string | null => _refreshToken,

  /**
   * Persist both tokens after login or refresh (RT rotation).
   * Updates memory cache immediately, then writes to SecureStore async.
   */
  setTokens: async (
    accessToken: string,
    refreshToken: string
  ): Promise<void> => {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    await Promise.all([
      SecureStore.setItemAsync(AT_KEY, accessToken),
      SecureStore.setItemAsync(RT_KEY, refreshToken),
    ]);
  },

  /**
   * Clear all credentials on logout or forced logout.
   * Wipes both memory cache and SecureStore.
   */
  clear: async (): Promise<void> => {
    _accessToken = null;
    _refreshToken = null;
    await Promise.all([
      SecureStore.deleteItemAsync(AT_KEY),
      SecureStore.deleteItemAsync(RT_KEY),
    ]);
  },
};
