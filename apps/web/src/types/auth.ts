/**
 * User roles mirroring the backend RBAC (ADR-05).
 *
 * Values follow the OpenAPI spec:
 * - `student` — regular student browsing & registering
 * - `btc` — organizer (Ban Tổ Chức)
 * - `checkin_staff` — QR scanning staff (mobile-only)
 */
export type Role = "student" | "btc" | "checkin_staff";

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
 * Login request body per OpenAPI spec.
 *
 * - `accountType="student"` requires `studentId` (MSSV, 8 digits).
 * - `accountType="staff"` requires `email`.
 */
export interface LoginRequest {
  accountType: "STUDENT" | "STAFF";
  studentId?: string;
  email?: string;
  password: string;
}

/**
 * Successful login response envelope per OpenAPI spec.
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
