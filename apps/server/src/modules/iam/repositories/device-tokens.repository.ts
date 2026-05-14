import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { DATABASE_CONNECTION, DATABASE_SCHEMA } from "@/infra/database";
import type { DatabaseClient, DatabaseSchema } from "@/infra/database";
import type { DeviceToken } from "@/infra/database/types/identity.types";
import { systemErrors } from "@/shared/response/errors";
import { Result, tryCatch } from "@/shared/response/result";

@Injectable()
export class DeviceTokensRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA)
    private readonly schema: DatabaseSchema
  ) {}

  /**
   * Looks up a device token by its token string.
   *
   * @param token - The device token string.
   * @returns The device token entity or null if not found.
   */
  async findByToken(token: string): Promise<Result<DeviceToken | null>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .select()
          .from(this.schema.deviceTokens)
          .where(eq(this.schema.deviceTokens.token, token))
          .limit(1);
        return result ?? null;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Lists all active device tokens for a given student.
   *
   * @param studentId - The student's UUID.
   * @returns Array of active device tokens.
   */
  async findByStudentId(studentId: string): Promise<Result<DeviceToken[]>> {
    return tryCatch(
      async () =>
        this.db
          .select()
          .from(this.schema.deviceTokens)
          .where(
            and(
              eq(this.schema.deviceTokens.studentId, studentId),
              eq(this.schema.deviceTokens.isActive, true)
            )
          ),
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Creates a new device token record.
   *
   * @param data - Object containing studentId, token, and platform.
   * @returns The created device token entity.
   */
  async create(data: {
    studentId: string;
    token: string;
    platform: "IOS" | "ANDROID";
  }): Promise<Result<DeviceToken>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .insert(this.schema.deviceTokens)
          .values(data)
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Soft-deletes a device token by setting is_active to false.
   *
   * @param token - The device token string to deactivate.
   * @returns OkResult<void> on success.
   */
  async deactivateByToken(token: string): Promise<Result<void>> {
    return tryCatch(
      async () => {
        await this.db
          .update(this.schema.deviceTokens)
          .set({ isActive: false })
          .where(eq(this.schema.deviceTokens.token, token));
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Updates the lastSeen timestamp of a device token.
   *
   * @param deviceTokenId - The device token's UUID.
   * @returns The updated device token entity.
   */
  async updateLastSeen(deviceTokenId: string): Promise<Result<DeviceToken>> {
    return tryCatch(
      async () => {
        const [result] = await this.db
          .update(this.schema.deviceTokens)
          .set({ lastSeen: new Date() })
          .where(eq(this.schema.deviceTokens.deviceTokenId, deviceTokenId))
          .returning();
        return result;
      },
      (err) => systemErrors.internal(err)
    );
  }

  /**
   * Soft-deletes all active device tokens for a given student on a given platform.
   *
   * @param studentId - The student's UUID.
   * @param platform - The platform ("IOS" | "ANDROID").
   * @returns OkResult<void> on success.
   */
  async deactivateAllForStudent(
    studentId: string,
    platform: "IOS" | "ANDROID"
  ): Promise<Result<void>> {
    return tryCatch(
      async () => {
        await this.db
          .update(this.schema.deviceTokens)
          .set({ isActive: false })
          .where(
            and(
              eq(this.schema.deviceTokens.studentId, studentId),
              eq(this.schema.deviceTokens.platform, platform),
              eq(this.schema.deviceTokens.isActive, true)
            )
          );
      },
      (err) => systemErrors.internal(err)
    );
  }
}
