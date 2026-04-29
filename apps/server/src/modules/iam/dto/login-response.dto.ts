/**
 * Login Response DTO
 *
 * Response: POST /auth/login
 * Shape: { access_token, refresh_token?, expires_in, user: AuthMeDto }
 *
 * Factory: from(tokenPair, user, studentProfile?)
 */

export interface LoginResponseDto {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  user: any; // TODO: AuthMeResponseDto
}

export class LoginResponseBuilder {
  static from(
    tokenPair: {
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
    },
    user: any,
    studentProfile?: any
  ): LoginResponseDto {
    // TODO: Implement factory method
    return {
      access_token: "",
      expires_in: 0,
      user: null,
    };
  }
}
