/**
 * Roles-Based Access Control (RBAC) Guard
 *
 * Phân quyền RBAC theo role. Đọc metadata 'roles' được set bởi @Roles() decorator.
 * So sánh với request.user.role từ JWT payload. Trả 403 FORBIDDEN nếu không khớp.
 * Phụ thuộc vào JwtAuthGuard chạy trước.
 *
 * @see @Roles() decorator để định nghĩa roles
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // TODO: Implement role checking logic
    // 1. Get roles metadata from route handler via reflector
    // 2. Get user.role from request.user (from JwtAuthGuard)
    // 3. Compare and throw ForbiddenException if not authorized

    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler()
    );
    if (!requiredRoles) {
      return true; // No role requirement
    }

    const request = context.switchToHttp().getRequest<Request>();
    // const userRole = request.user?.role;
    // TODO: Compare userRole with requiredRoles
    // if (!requiredRoles.includes(userRole)) {
    //   throw new ForbiddenException('Insufficient permissions');
    // }

    return true;
  }
}
