import { Injectable } from "@nestjs/common";

import { deviceTokenErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { DeviceTokensRepository } from "../repositories/device-tokens.repository";

@Injectable()
export class DeviceTokensService {
  constructor(
    private readonly deviceTokensRepo: DeviceTokensRepository
  ) {}

  /**
   * Registers a device token for push notifications.
   *
   * Business rules:
   * - Deactivates all existing active tokens for the same student+platform before
   *   creating the new one, preventing token accumulation.
   * - Returns the newly created device token record.
   *
   * Side effects:
   * - Updates device_tokens table (deactivate old, insert new).
   *
   * @param studentId - The student's UUID.
   * @param token - The device token string from the push provider.
   * @param platform - The platform identifier ("WEB" | "MOBILE").
   * @returns OkResult with the created device token, or FailResult.
   */
  async registerToken(
    studentId: string,
    token: string,
    platform: string
  ): Promise<
    Result<{
      deviceTokenId: string;
      platform: string;
      createdAt: Date;
    }>
  > {
    // Deactivate old tokens for this student+platform
    const deactivateResult = await this.deviceTokensRepo.deactivateAllForStudent(
      studentId,
      platform
    );
    if (deactivateResult.isFailure) return Result.fail(deactivateResult.error);

    // Create new token
    const createResult = await this.deviceTokensRepo.create({
      studentId,
      token,
      platform,
    });
    if (createResult.isFailure) return Result.fail(createResult.error);

    const created = createResult.data;
    return Result.ok({
      deviceTokenId: created.deviceTokenId,
      platform: created.platform,
      createdAt: created.createdAt,
    });
  }

  /**
   * Validates that a device token belongs to the specified student (IDOR prevention).
   *
   * Business rules:
   * - On mismatch (token not found or belongs to another student), returns
   *   DEVICE_TOKEN_OWNERSHIP_MISMATCH.
   *
   * @param token - The device token string to check.
   * @param studentId - The student's UUID claiming ownership.
   * @returns OkResult with the device token, or FailResult with ownershipMismatch.
   */
  async validateOwnership(
    token: string,
    studentId: string
  ): Promise<Result<{ deviceTokenId: string }>> {
    const findResult = await this.deviceTokensRepo.findByToken(token);
    if (findResult.isFailure) return Result.fail(findResult.error);

    const deviceToken = findResult.data;
    if (!deviceToken) {
      return Result.fail(deviceTokenErrors.notFound(token));
    }

    if (deviceToken.studentId !== studentId) {
      return Result.fail(deviceTokenErrors.ownershipMismatch(token));
    }

    return Result.ok({ deviceTokenId: deviceToken.deviceTokenId });
  }

  /**
   * Deactivates (soft-deletes) a device token after validating ownership.
   *
   * Business rules:
   * - First validates that the token belongs to the requesting student.
   * - Only deactivates if ownership check passes.
   *
   * Side effects:
   * - Sets is_active = false on the device_tokens row.
   *
   * @param token - The device token string to deactivate.
   * @param studentId - The student's UUID claiming ownership.
   * @returns OkResult<void> on success, or FailResult.
   */
  async deactivateToken(
    token: string,
    studentId: string
  ): Promise<Result<void>> {
    const ownershipResult = await this.validateOwnership(token, studentId);
    if (ownershipResult.isFailure) return Result.fail(ownershipResult.error);

    return this.deviceTokensRepo.deactivateByToken(token);
  }
}
