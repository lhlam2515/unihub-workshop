import type { UniHubJwtPayload } from "@/lib/api/client/offline-auth";

/**
 * Login loading state machine.
 * - idle: initial state, no request in flight
 * - loading: login request in progress
 * - success: login succeeded, navigation pending
 * - error: login failed, errorMessage is set
 */
export type LoginStatus = "idle" | "loading" | "success" | "error";

export interface UseAuthResult {
  /** Decoded JWT payload from the stored Access Token, or null if not logged in */
  session: UniHubJwtPayload | null;
  /** Login state */
  loginStatus: LoginStatus;
  /** Login error message (null when idle or success) */
  errorMessage: string | null;
  /** Whether a logout is in progress */
  isLoggingOut: boolean;
  /**
   * Authenticate with email + password.
   * On success, persists session to local DB and navigates to the tabs screen.
   */
  login: (email: string, password: string) => Promise<void>;
  /**
   * Check the offline queue for pending sync records.
   * @returns Number of PENDING records in the queue
   */
  getPendingQueueCount: () => number;
  /**
   * Force logout — clears tokens and navigates to login screen.
   */
  logout: () => Promise<void>;
}
