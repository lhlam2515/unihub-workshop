import { API_ROUTES } from "@/constants/api-routes";
import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";
import type { LoginRequest, LoginResponse } from "@/types/auth";

/**
 * Authenticate with the backend using the provided credentials.
 *
 * Delegates to the shared api client which handles token storage and
 * 401 retry. On success the access token is already in the in-memory store.
 *
 * @param credentials - Login payload per OpenAPI spec (accountType + studentId or email)
 * @returns OkResult with LoginResponse, or FailResult (INVALID_CREDENTIALS, USER_SUSPENDED, RATE_LIMIT_EXCEEDED)
 */
export async function loginService(
  credentials: LoginRequest
): Promise<Result<LoginResponse>> {
  return Result.fromPromise(
    api.post<LoginResponse>(API_ROUTES.AUTH.LOGIN, credentials)
  );
}
