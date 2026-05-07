/**
 * User roles mirroring the backend RBAC (ADR-05).
 */
export type Role = "STUDENT" | "BTC" | "CHECKIN_STAFF";

/**
 * Authenticated user profile returned from GET /auth/me and login responses.
 */
export interface User {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  /** Only populated for checkin_staff — limits which workshops they can scan */
  allowedWorkshopIds?: string[];
}

/**
 * Login request body.
 *
 * `STUDENT` requires `studentId`; `STAFF` requires `email`.
 */
export interface LoginRequest {
  accountType: "STUDENT" | "STAFF";
  studentId?: string;
  email?: string;
  password: string;
}

/**
 * Successful login response envelope.
 */
export interface LoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  role: Role;
  /** null for web clients (token is in HttpOnly cookie); populated for mobile */
  refreshToken: string | null;
  user: User;
}
