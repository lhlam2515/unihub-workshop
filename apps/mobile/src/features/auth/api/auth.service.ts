import { login } from "@/lib/api/client";
import { Result } from "@/lib/result";

export interface LoginCredentials {
  accountType: "STAFF";
  email: string;
  password: string;
}

export interface LoginSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  role: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

class AuthService {
  /**
   * Authenticate a CHECKIN_STAFF user with email and password.
   *
   * Side effects:
   * - Stores `accessToken` and `refreshToken` in hybrid memory + SecureStore
   *   via `tokenStore.setTokens()` (handled inside `login()`).
   *
   * @param credentials - Staff email and password
   * @returns OkResult with session data, or FailResult with ApiError
   */
  async loginWithCredentials(
    credentials: LoginCredentials
  ): Promise<Result<LoginSession>> {
    return Result.fromPromise(
      login<LoginCredentials, LoginSession>(credentials)
    );
  }
}

export const authService = new AuthService();
