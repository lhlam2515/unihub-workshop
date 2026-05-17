import { AuthMeResponseBuilder } from "./auth-me-response.dto";

/**
 * Response returned by POST /auth/login.
 *
 * Matches OpenAPI LoginResponse schema.
 * Contains the access token (Bearer) with 15-minute expiry, nullable refresh token,
 * and the identity's role alongside their basic profile. The refresh token is also set
 * as an HttpOnly cookie by the controller for the WEB flow.
 */
export interface LoginResponseDto {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshToken: string | null;
  role: "STUDENT" | "BTC" | "CHECKIN_STAFF";
  user: ReturnType<typeof AuthMeResponseBuilder.from>;
}

/**
 * Builds a LoginResponseDto from a token pair and identity data.
 */
export class LoginResponseBuilder {
  static from(
    tokenPair: {
      accessToken: string;
      refreshToken: string | null;
      expiresIn: number;
    },
    identity: {
      identityId: string;
      email: string;
      role: string;
      allowedWorkshopIds?: string[];
    },
    studentProfile?: {
      studentId: string | undefined;
      fullName: string;
    }
  ): LoginResponseDto {
    return {
      accessToken: tokenPair.accessToken,
      tokenType: "Bearer",
      expiresIn: tokenPair.expiresIn,
      refreshToken: tokenPair.refreshToken,
      role: identity.role as "STUDENT" | "BTC" | "CHECKIN_STAFF",
      user: AuthMeResponseBuilder.from(identity, studentProfile),
    };
  }
}
