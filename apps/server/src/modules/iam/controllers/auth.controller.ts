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
import { RateLimit } from "@/shared/decorators/rate-limit.decorator";
import { Result } from "@/shared/response/result";
import type { JwtPayload } from "@/types/jwt-payload";

import { AuthService } from "../services/auth.service";

import type { LoginDto } from "../dto/login.dto";
import type { RefreshTokenDto } from "../dto/refresh-token.dto";
import type { Request, Response } from "express";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/api/v1/auth/refresh",
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   *
   * Authenticates a user by account type and credentials. Returns a dual-token pair
   * (access + refresh) with 15-minute access token expiry.
   *
   * Business rules:
   * - Refresh token is set as an HttpOnly cookie (for both WEB and MOBILE).
   * - MOBILE client reads refreshToken from the response body.
   *
   * @Public — no JWT required.
   *
   * @param loginDto - Validated LoginDto containing accountType, password, and conditional studentId/email.
   * @param response - Express response object for setting the HttpOnly cookie.
   */
  @RateLimit([{ tier: "T1", limit: 60, windowMs: 60000 }])
  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login({
      accountType: loginDto.accountType,
      password: loginDto.password,
      studentId: loginDto.studentId,
      email: loginDto.email,
    });

    if (result.isSuccess) {
      response.cookie(
        "refreshToken",
        result.data.refreshToken!,
        REFRESH_COOKIE_OPTIONS
      );
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
   * - The new refresh token is set as an HttpOnly cookie (always).
   * - Platform is inferred from token source: body → MOBILE (8hr TTL),
   *   cookie → WEB (15min TTL).
   * - The old refresh token is blacklisted in Redis (rotation).
   *
   * @Public — no JWT required (uses refresh token instead).
   *
   * @param refreshTokenDto - Contains the refreshToken string (optional for Web cookie flow).
   * @param response - Express response object for setting the HttpOnly cookie.
   */
  @RateLimit([{ tier: "T1", limit: 30, windowMs: 60000 }])
  @Post("refresh")
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request
  ) {
    const bodyToken = refreshTokenDto.refreshToken ?? "";
    const cookieToken =
      (request.cookies?.refreshToken as string | undefined) ?? "";
    const refreshTokenStr = bodyToken || cookieToken;
    const platform: "WEB" | "MOBILE" = bodyToken ? "MOBILE" : "WEB";
    const result = await this.authService.refreshToken(
      refreshTokenStr,
      platform
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
   * Returns 204 No Content on success.
   *
   * Requires valid JWT. Any authenticated role can access.
   */
  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const refreshTokenStr = request.cookies?.refreshToken as string | undefined;
    const result = await this.authService.logout(
      user.sub,
      user.jti,
      refreshTokenStr
    );
    if (result.isFailure) return result;

    response.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/api/v1/auth/refresh",
    });
    return;
  }

  /**
   * GET /auth/me
   *
   * Returns the authenticated user's profile with role-specific fields:
   * - STUDENT: includes student_code, full_name, faculty.
   * - CHECKIN_STAFF: includes allowed_workshop_ids.
   * - BTC: base fields only.
   *
   * Requires valid JWT. Any authenticated role can access.
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }
}
