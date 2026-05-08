import { AuthMeResponseBuilder } from "./auth-me-response.dto";

/**
 * Response returned by POST /auth/login.
 *
 * Contains the access token (Bearer) with 15-minute expiry, optional refresh token,
 * and the user's role alongside their basic profile. The refresh token is also set
 * as an HttpOnly cookie by the controller for the WEB flow.
 */
export interface LoginResponseDto {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshToken?: string;
  role: string;
  user: ReturnType<typeof AuthMeResponseBuilder.from>;
}

/**
 * Builds a LoginResponseDto from a token pair and user data.
 */
export class LoginResponseBuilder {
  static from(
    tokenPair: {
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
    },
    user: {
      userId: string;
      email: string;
      role: string;
      allowedWorkshopIds?: string[];
    },
    studentProfile?: {
      studentId: string;
      fullName: string;
    }
  ): LoginResponseDto {
    return {
      accessToken: tokenPair.accessToken,
      tokenType: "Bearer",
      expiresIn: tokenPair.expiresIn,
      refreshToken: tokenPair.refreshToken,
      role: user.role,
      user: AuthMeResponseBuilder.from(user, studentProfile),
    };
  }
}
