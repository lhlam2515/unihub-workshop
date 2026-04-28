/**
 * Token Service
 *
 * Toàn bộ lifecycle của JWT:
 * - signAccessToken(payload, platform)
 * - signRefreshToken()
 * - verifyAccessToken(token)
 * - verifyRefreshToken(token)
 * - blacklistToken(jti, remainingTtl)
 * - isBlacklisted(jti)
 *
 * Sử dụng RedisService để lưu/tra cứu Blacklist (token:blacklist:{jti}).
 * Sử dụng jsonwebtoken hoặc @nestjs/jwt.
 */

import { Injectable } from '@nestjs/common';
import { RedisService } from '@shared/redis/redis.service';

@Injectable()
export class TokenService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * signAccessToken(payload: any, platform: 'WEB' | 'MOBILE'): Promise<string>
   *
   * TODO: Generate JWT access token with platform-specific expiry
   * - WEB: 15 minutes
   * - MOBILE: 8 hours
   * - Include user.id, user.role, jti (unique token ID)
   */
  async signAccessToken(
    payload: any,
    platform: 'WEB' | 'MOBILE'
  ): Promise<string> {
    // TODO: Implement
    return '';
  }

  /**
   * signRefreshToken(userId: string): Promise<string>
   *
   * TODO: Generate JWT refresh token with long expiry (7 days)
   */
  async signRefreshToken(userId: string): Promise<string> {
    // TODO: Implement
    return '';
  }

  /**
   * verifyAccessToken(token: string): Promise<any>
   *
   * TODO: Verify and decode access token
   * - Check signature
   * - Check expiration
   * - Return decoded payload
   * - Throw if invalid
   */
  async verifyAccessToken(token: string): Promise<any> {
    // TODO: Implement
    return null;
  }

  /**
   * verifyRefreshToken(token: string): Promise<any>
   *
   * TODO: Verify and decode refresh token
   */
  async verifyRefreshToken(token: string): Promise<any> {
    // TODO: Implement
    return null;
  }

  /**
   * blacklistToken(jti: string, remainingTtl: number): Promise<void>
   *
   * TODO: Add token to blacklist in Redis
   * - Store in token:blacklist:{jti}
   * - Set expiry = remainingTtl (seconds until token natural expiry)
   */
  async blacklistToken(jti: string, remainingTtl: number): Promise<void> {
    // TODO: Implement
  }

  /**
   * isBlacklisted(jti: string): Promise<boolean>
   *
   * TODO: Check if token is in blacklist
   * - Query token:blacklist:{jti} from Redis
   * - Return true if exists, false otherwise
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    // TODO: Implement
    return false;
  }
}
