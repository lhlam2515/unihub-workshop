/**
 * Workshop Scope Guard
 *
 * Kiểm soát phạm vi của CHECKIN_STAFF. Đọc workshop_id từ route param hoặc
 * request body, so sánh với mảng allowed_workshop_ids trong JWT payload.
 * Trả 403 CHECKIN_SCOPE_DENIED nếu workshop không nằm trong danh sách
 * được phân công. Chỉ áp dụng cho routes trong module checkin.
 *
 * @see used in Check-in Module
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";

@Injectable()
export class WorkshopScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // TODO: Implement workshop scope checking
    // 1. Extract workshop_id from route params or request body
    // 2. Get allowed_workshop_ids from request.user.allowed_workshop_ids
    // 3. Check if workshop_id is in allowed list
    // 4. Throw ForbiddenException with CHECKIN_SCOPE_DENIED if not

    const request = context.switchToHttp().getRequest<Request>();
    // const workshopId = request.params.id || request.body.workshop_id;
    // const allowedWorkshops = request.user?.allowed_workshop_ids || [];
    // TODO: Validate workshopId in allowedWorkshops

    return true;
  }
}
