/**
 * JWT Authentication Guard
 *
 * Middleware xác thực chính. Giải mã JWT từ Authorization: Bearer header,
 * kiểm tra chữ ký và exp. Tra cứu jti trong Redis Blacklist - nếu tồn tại
 * trả 401 TOKEN_REVOKED. Bỏ qua (skip) nếu route được đánh dấu @Public().
 * Gắn JwtPayload vào request.user để các component sau sử dụng.
 *
 * @see JwtPayload từ @database/types
 * @see @Public() decorator để bỏ qua xác thực
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // TODO: Implement JWT validation logic
    // 1. Check @Public() decorator - if present, skip authentication
    // 2. Extract token from Authorization: Bearer header
    // 3. Verify JWT signature and expiration
    // 4. Check token blacklist in Redis (token:blacklist:{jti})
    // 5. Attach JwtPayload to request.user
    // 6. Throw UnauthorizedException on invalid token

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      // TODO: Decode and verify JWT
      // const payload = this.tokenService.verifyAccessToken(token);
      // TODO: Check blacklist
      // const isBlacklisted = await this.tokenService.isBlacklisted(payload.jti);
      // if (isBlacklisted) throw error with TOKEN_REVOKED
      // request.user = payload;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
