/**
 * Roles Decorator
 *
 * SetMetadata decorator gắn danh sách role vào route handler metadata.
 * RolesGuard đọc metadata này để kiểm tra quyền.
 * Dùng UserRole enum từ @database/types.
 *
 * @example
 * @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
 */

import { SetMetadata } from "@nestjs/common";

export const Roles = (...roles: string[]) => SetMetadata("roles", roles);
