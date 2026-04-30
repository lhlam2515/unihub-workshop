import { AuthMeResponseBuilder } from "./auth-me-response.dto";

/**
 * Response returned by POST /auth/login.
 *
 * Contains the access token with platform-specific expiry and role-appropriate
 * user profile. The refresh token is included for MOBILE; for WEB it is set
 * via HttpOnly cookie by the controller.
 */
export interface LoginResponseDto {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
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
      studentCode: string;
      fullName: string;
      faculty: string | null;
    }
  ): LoginResponseDto {
    return {
      access_token: tokenPair.accessToken,
      refresh_token: tokenPair.refreshToken,
      expires_in: tokenPair.expiresIn,
      user: AuthMeResponseBuilder.from(user, studentProfile),
    };
  }
}
