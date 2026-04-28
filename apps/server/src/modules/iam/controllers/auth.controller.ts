/**
 * Auth Controller
 *
 * Xử lý:
 * - POST /auth/login (PUBLIC)
 * - POST /auth/refresh (PUBLIC)
 * - POST /auth/logout (JWT required, ANY role)
 * - GET /auth/me (JWT required, ANY role)
 */

import { JwtAuthGuard } from '@core/guards/jwt-auth.guard';
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Public } from '@shared/decorators/public.decorator';

import { AuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * @param loginDto { email, password, platform }
   * @returns { access_token, refresh_token?, expires_in, user }
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: any) {
    // TODO: Validate input with Zod (LoginSchema)
    // TODO: Call authService.login(loginDto)
    // TODO: Return LoginResponseDto via ResponseInterceptor
  }

  /**
   * POST /auth/refresh
   * @param refreshTokenDto { refresh_token? }
   * @returns { access_token, refresh_token?, expires_in }
   */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: any) {
    // TODO: Validate input with Zod (RefreshTokenSchema)
    // TODO: Call authService.refreshToken(refreshTokenDto)
    // TODO: Return new token pair
  }

  /**
   * POST /auth/logout
   * Requires valid JWT
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: any) {
    // TODO: Call authService.logout(user.id, user.jti)
    // TODO: Blacklist current token in Redis
  }

  /**
   * GET /auth/me
   * Requires valid JWT
   * Returns user info based on role
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: any) {
    // TODO: Call authService.getMe(user.id)
    // TODO: Return AuthMeResponseDto with role-specific fields
  }
}
