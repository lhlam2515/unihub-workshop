import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/modules/iam/guards/jwt-auth.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Public } from "@/shared/decorators/public.decorator";
import { Result } from "@/shared/response/result";
import type { JwtPayload } from "@/types/jwt-payload";

import { AuthService } from "../services/auth.service";

import type { LoginDto } from "../dto/login.dto";
import type { RefreshTokenDto } from "../dto/refresh-token.dto";
import type { Request, Response } from "express";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/api/auth/refresh",
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   *
   * Authenticates a user by email and password. Returns a dual-token pair
   * (access + refresh) with platform-specific expiry.
   *
   * Business rules:
   * - WEB: refresh token is set as an HttpOnly cookie (not exposed to JS).
   * - MOBILE: refresh token is returned in the response body.
   *
   * @Public — no JWT required.
   *
   * @param loginDto - Validated LoginDto containing email, password, and platform.
   * @param response - Express response object for setting the HttpOnly cookie.
   */
  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
      loginDto.platform
    );

    if (result.isSuccess && loginDto.platform === "WEB") {
      response.cookie(
        "refreshToken",
        result.data.refresh_token!,
        REFRESH_COOKIE_OPTIONS
      );
      return Result.ok({ ...result.data, refresh_token: undefined });
    }

    return result;
  }

  /**
   * POST /auth/refresh
   *
   * Issues a new access token using a valid refresh token. Implements refresh
   * token rotation: the consumed refresh token is blacklisted.
   *
   * Business rules:
   * - The new refresh token is set as an HttpOnly cookie (WEB flow).
   * - The old refresh token is blacklisted in Redis (rotation).
   *
   * @Public — no JWT required (uses refresh token instead).
   *
   * @param refreshTokenDto - Contains the refresh_token string (optional for Web cookie flow).
   * @param response - Express response object for setting the HttpOnly cookie.
   */
  @Post("refresh")
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request
  ) {
    const bodyToken = refreshTokenDto.refresh_token ?? "";
    const cookieToken =
      (request.cookies?.refreshToken as string | undefined) ?? "";
    const refreshTokenStr = bodyToken || cookieToken;
    const result = await this.authService.refreshToken(
      refreshTokenStr,
      refreshTokenDto.platform
    );

    if (result.isSuccess) {
      response.cookie(
        "refreshToken",
        result.data.refreshToken!,
        REFRESH_COOKIE_OPTIONS
      );
      return Result.ok({ ...result.data, refreshToken: undefined });
    }

    return result;
  }

  /**
   * POST /auth/logout
   *
   * Blacklists the current access token's jti in Redis, terminating the session.
   * Idempotent — calling with an already-blacklisted token succeeds silently.
   *
   * Requires valid JWT. Any authenticated role can access.
   */
  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: JwtPayload) {
    return this.authService.logout(user.sub, user.jti);
  }

  /**
   * GET /auth/me
   *
   * Returns the authenticated user's profile with role-specific fields:
   * - STUDENT: includes student_code, full_name, faculty.
   * - CHECKIN_STAFF: includes allowed_workshop_ids.
   * - ORGANIZER: base fields only.
   *
   * Requires valid JWT. Any authenticated role can access.
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }
}
