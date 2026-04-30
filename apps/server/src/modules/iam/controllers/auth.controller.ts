import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { Public } from "@/shared/decorators/public.decorator";
import type { JwtPayload } from "@/types/jwt-payload";

import { LoginSchema } from "../dto/login.dto";
import { RefreshTokenSchema } from "../dto/refresh-token.dto";
import { AuthService } from "../services/auth.service";

import type { LoginDto } from "../dto/login.dto";
import type { RefreshTokenDto } from "../dto/refresh-token.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   *
   * Authenticates a user by email and password. Returns a dual-token pair
   * (access + refresh) with platform-specific expiry.
   *
   * @Public — no JWT required.
   *
   * @param loginDto - Validated LoginDto containing email, password, and platform.
   */
  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const parsed = LoginSchema.parse(loginDto);
    return this.authService.login(
      parsed.email,
      parsed.password,
      parsed.platform
    );
  }

  /**
   * POST /auth/refresh
   *
   * Issues a new access token using a valid refresh token. Implements refresh
   * token rotation: the consumed refresh token is blacklisted.
   *
   * @Public — no JWT required (uses refresh token instead).
   *
   * @param refreshTokenDto - Contains the refresh_token string (optional for Web cookie flow).
   */
  @Post("refresh")
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const parsed = RefreshTokenSchema.parse(refreshTokenDto);
    return this.authService.refreshToken(parsed.refresh_token ?? "");
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
