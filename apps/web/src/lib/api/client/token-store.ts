/**
 * In-memory Access Token store.
 *
 * Security constraints:
 * - The token lives ONLY in this module-level variable.
 * - No code in this module may write to localStorage or sessionStorage.
 * - The Refresh Token is never handled here — it lives in an HttpOnly cookie
 *   managed entirely by the server.
 */
let _accessToken: string | null = null;

export const tokenStore = {
  /** Return the current in-memory Access Token, or null if not authenticated. */
  get: (): string | null => _accessToken,

  /** Store a new Access Token in memory after a successful login or refresh. */
  set: (token: string): void => {
    _accessToken = token;
  },

  /** Remove the Access Token from memory on logout or forced logout. */
  clear: (): void => {
    _accessToken = null;
  },
};
