import { login } from "@/lib/api/client";
import { Result } from "@/lib/result";

export interface LoginCredentials {
  email: string;
  password: string;
  platform: "MOBILE";
}

export interface LoginSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    user_id: string;
    email: string;
    role: string;
  };
}

class AuthService {
  /**
   * Authenticate a CHECKIN_STAFF user with email and password.
   *
   * Side effects:
   * - Stores `access_token` and `refresh_token` in hybrid memory + SecureStore
   *   via `tokenStore.setTokens()` (handled inside `login()`).
   *
   * @param credentials - Staff email and password
   * @returns OkResult with session data, or FailResult with ApiError
   */
  async loginWithCredentials(
    credentials: LoginCredentials
  ): Promise<Result<LoginSession>> {
    return Result.fromPromise(login<LoginCredentials, LoginSession>(credentials));
  }
}

export const authService = new AuthService();
