import { Injectable } from "@nestjs/common";

import { deviceTokenErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { DeviceTokensRepository } from "../repositories/device-tokens.repository";

@Injectable()
export class DeviceTokensService {
  constructor(private readonly deviceTokensRepo: DeviceTokensRepository) {}

  /**
   * Registers a device token for push notifications.
   *
   * Business rules:
   * - If the token already exists for the current student, updates lastSeen and returns 200 (upsert).
   * - If the token is new, deactivates all existing active tokens for the same student+platform
   *   before creating the new one, preventing token accumulation, and returns 201 (created).
   * - Accepts lowercase platform ("ios" | "android") and uppercases before DB insert.
   * - Returns the device token record with isNew flag to signal HTTP status code (201 vs 200).
   *
   * Side effects:
   * - Updates device_tokens table (upsert or deactivate old + insert new).
   *
   * @param studentId - The student code (MSSV, TEXT PK from students table, e.g. "21127001").
   * @param token - The device token string from the push provider.
   * @param platform - The platform identifier ("IOS" | "ANDROID").
   * @returns OkResult with the device token and isNew flag, or FailResult.
   */
  async registerToken(
    studentId: string,
    token: string,
    platform: "IOS" | "ANDROID"
  ): Promise<
    Result<{
      id: string;
      platform: string;
      isActive: boolean;
      lastSeen: Date;
      createdAt: Date;
      isNew: boolean;
    }>
  > {
    const dbPlatform = platform.toUpperCase() as "IOS" | "ANDROID";

    // Check if token already exists for this student
    const existingResult = await this.deviceTokensRepo.findByToken(token);
    if (existingResult.isFailure) return Result.fail(existingResult.error);

    const existingToken = existingResult.data;
    const isNew = !existingToken || existingToken.studentId !== studentId;

    if (!isNew && existingToken) {
      // Token exists for this student — upsert: update lastSeen
      const updateResult = await this.deviceTokensRepo.updateLastSeen(
        existingToken.deviceTokenId
      );
      if (updateResult.isFailure) return Result.fail(updateResult.error);

      const updated = updateResult.data;
      return Result.ok({
        id: updated.deviceTokenId,
        platform: updated.platform,
        isActive: updated.isActive,
        lastSeen: updated.lastSeen,
        createdAt: updated.createdAt,
        isNew: false,
      });
    }

    // Token is new — deactivate old tokens for this student+platform, then create
    const deactivateResult =
      await this.deviceTokensRepo.deactivateAllForStudent(
        studentId,
        dbPlatform
      );
    if (deactivateResult.isFailure) return Result.fail(deactivateResult.error);

    // Create new token
    const createResult = await this.deviceTokensRepo.create({
      studentId,
      token,
      platform: dbPlatform,
    });
    if (createResult.isFailure) return Result.fail(createResult.error);

    const created = createResult.data;
    return Result.ok({
      id: created.deviceTokenId,
      platform: created.platform,
      isActive: created.isActive,
      lastSeen: created.lastSeen,
      createdAt: created.createdAt,
      isNew: true,
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
