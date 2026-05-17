import { Injectable } from "@nestjs/common";

import { RedisService } from "@/infra/redis/redis.service";
import { Result } from "@/shared/response/result";

import { StaffRepository } from "../repositories/staff.repository";

@Injectable()
export class StaffAdminService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly redisService: RedisService
  ) {}

  async listStaff(
    role?: string,
    q?: string,
    page = 1,
    limit = 20
  ): Promise<
    Result<{
      items: Array<{
        staffId: string;
        email: string;
        fullName: string;
        role: string;
        isActive: boolean;
        createdAt: Date;
      }>;
      total: number;
    }>
  > {
    const result = await this.staffRepo.list(role, q, page, limit);
    if (result.isFailure) return Result.fail(result.error);

    return Result.ok({
      items: result.data.items.map((s) => ({
        staffId: s.staffId,
        email: s.email,
        fullName: s.fullName,
        role: s.role,
        isActive: s.isActive,
        createdAt: s.createdAt,
      })),
      total: result.data.total,
    });
  }

  async getStaffById(staffId: string): Promise<
    Result<{
      staffId: string;
      email: string;
      fullName: string;
      role: string;
      isActive: boolean;
      createdAt: Date;
    }>
  > {
    const result = await this.staffRepo.findById(staffId);
    if (result.isFailure) return Result.fail(result.error);
    if (!result.data) {
      return Result.fail({
        category: "NOT_FOUND" as const,
        code: "USER_NOT_FOUND" as const,
        message: `Staff ${staffId} not found.`,
      });
    }

    return Result.ok({
      staffId: result.data.staffId,
      email: result.data.email,
      fullName: result.data.fullName,
      role: result.data.role,
      isActive: result.data.isActive,
      createdAt: result.data.createdAt,
    });
  }

  async updateStaffStatus(
    staffId: string,
    isActive: boolean
  ): Promise<
    Result<{
      staffId: string;
      email: string;
      fullName: string;
      role: string;
      isActive: boolean;
    }>
  > {
    const updateResult = await this.staffRepo.updateStatus(staffId, isActive);
    if (updateResult.isFailure) return Result.fail(updateResult.error);
    if (!updateResult.data) {
      return Result.fail({
        category: "NOT_FOUND" as const,
        code: "USER_NOT_FOUND" as const,
        message: `Staff ${staffId} not found.`,
      });
    }

    if (!isActive) {
      await this.redisService.set(
        `staff:suspended:${staffId}`,
        "true",
        604_800
      );
    } else {
      await this.redisService.del(`staff:suspended:${staffId}`);
    }

    return Result.ok({
      staffId: updateResult.data.staffId,
      email: updateResult.data.email,
      fullName: updateResult.data.fullName,
      role: updateResult.data.role,
      isActive: updateResult.data.isActive,
    });
  }
}
