/**
 * Offline authentication utilities for CHECKIN_STAFF.
 *
 * Decodes the JWT Access Token locally (without network) to:
 * 1. Check if the token is still valid (within 8-hour window).
 * 2. Extract `allowedWorkshopIds` for SQLite query filtering.
 * 3. Read user payload for profile display.
 *
 * IMPORTANT: This does NOT verify the JWT signature — it only reads
 * the payload. Signature verification is the server's responsibility.
 * This is acceptable because:
 * - The token was verified on the server at login time.
 * - We only read `exp` and `allowedWorkshopIds` for UX decisions.
 * - All offline check-in records are re-validated server-side during sync.
 */

import { jwtDecode } from "jwt-decode";

import { tokenStore } from "./token-store";

// ---------------------------------------------------------------------------
// JWT payload shape (matches backend token structure)
// ---------------------------------------------------------------------------

export interface UniHubJwtPayload {
  /** User ID (subject) */
  sub: string;
  /** User role — always "CHECKIN_STAFF" on mobile */
  role: string;
  /** Workshop IDs this staff is authorized to check in */
  allowedWorkshopIds: string[];
  /** Token expiration (Unix timestamp in seconds) */
  exp: number;
  /** Unique token identifier (for blacklist checking) */
  jti: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const offlineAuth = {
  /**
   * Check if the Access Token is still valid locally (no network required).
   *
   * Use this to decide whether to allow opening the QR Scanner screen
   * or to prompt re-login. The 8-hour AT window covers an entire work shift.
   */
  isTokenValidLocally: (): boolean => {
    const token = tokenStore.get();
    if (!token) return false;

    try {
      const { exp } = jwtDecode<UniHubJwtPayload>(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return exp > currentTime;
    } catch {
      return false;
    }
  },

  /**
   * Extract the list of workshop IDs this staff is authorized to handle.
   *
   * Used to filter SQLite-cached tickets — only tickets belonging to
   * these workshops are shown and accepted for offline check-in.
   */
  getAllowedWorkshops: (): string[] => {
    const token = tokenStore.get();
    if (!token) return [];

    try {
      return jwtDecode<UniHubJwtPayload>(token).allowedWorkshopIds ?? [];
    } catch {
      return [];
    }
  },

  /**
   * Decode and return the full JWT payload for display purposes.
   *
   * Used by SCR-M08 (Profile screen) to show user info, token expiry,
   * and assigned workshops without making a network call.
   *
   * @returns Decoded payload, or `null` if no token or decode failure.
   */
  getTokenPayload: (): UniHubJwtPayload | null => {
    const token = tokenStore.get();
    if (!token) return null;

    try {
      return jwtDecode<UniHubJwtPayload>(token);
    } catch {
      return null;
    }
  },
};
