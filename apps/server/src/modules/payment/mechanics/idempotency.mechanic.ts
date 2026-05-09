/**
 * Idempotency Mechanic
 *
 * 3-State idempotency enforcement using PostgreSQL as the source of truth.
 *
 * State machine:
 * - IN_PROGRESS → first request is being processed (locked for 30s).
 * - COMPLETED  → request succeeded; cached response is replayed on retry.
 * - UNRESOLVED → request failed partway; retries proceed again.
 *
 * Key pattern: SHA-256 hash of the idempotency key, stored in the
 * idempotency_keys table with a 30-second lock window.
 *
 * Business rules:
 * - IN_PROGRESS on check → IDEMPOTENCY_CONFLICT (another request in-flight).
 * - UNRESOLVED on check → allow retry (proceed=true).
 * - COMPLETED on check → replay cached response (proceed=false).
 * - New key on check → allow proceed (proceed=true).
 *
 * Side effects:
 * - Creates an idempotency_keys row with IN_PROGRESS status on first check.
 * - Updates status to COMPLETED with cached response on markCompleted.
 * - Updates status to UNRESOLVED with extended lock on markUnresolved.
 */
import crypto from "node:crypto";

import { Injectable } from "@nestjs/common";

import { idempotencyConflict } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { IdempotencyKeysRepository } from "../repositories/idempotency-keys.repository";

export interface IdempotencyCheckResult {
  proceed: boolean;
  cachedResponse?: { body: unknown; statusCode: number };
}

@Injectable()
export class IdempotencyMechanic {
  constructor(private readonly repo: IdempotencyKeysRepository) {}

  /**
   * Checks the idempotency key against the PostgreSQL idempotency_keys table.
   *
   * Flow:
   * 1. Hash the key using SHA-256.
   * 2. Try INSERT ... ON CONFLICT DO NOTHING.
   * 3. If new or UNRESOLVED → return { proceed: true }.
   * 4. If COMPLETED → return { proceed: false, cachedResponse }.
   * 5. If IN_PROGRESS → return IDEMPOTENCY_CONFLICT.
   *
   * Business rules:
   * - UNRESOLVED keys allow retry (the previous attempt failed partway).
   * - COMPLETED keys replay the cached response (idempotent replay).
   * - IN_PROGRESS keys reject with conflict (concurrent request detected).
   *
   * Side effects:
   * - Inserts a row into idempotency_keys when the key is new.
   *
   * @param key - The raw idempotency key from the X-Idempotency-Key header.
   * @param resourceType - 'REGISTRATION' or 'PAYMENT'.
   * @returns OkResult with proceed flag and optional cached response,
   * or FailResult with IDEMPOTENCY_CONFLICT or INTERNAL_ERROR.
   */
  async check(
    key: string,
    resourceType: "REGISTRATION" | "PAYMENT"
  ): Promise<Result<IdempotencyCheckResult>> {
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");

    const result = await this.repo.createOrGetExisting(keyHash, resourceType);
    if (result.isFailure) return Result.fail(result.error);

    const { isNew, status, responseBody, statusCode } = result.data;

    // New key or unresolved — allow proceed
    if (isNew || status === "UNRESOLVED") {
      return Result.ok({ proceed: true });
    }

    // Completed — replay cached response
    if (status === "COMPLETED") {
      return Result.ok({
        proceed: false,
        cachedResponse: { body: responseBody, statusCode: statusCode! },
      });
    }

    // IN_PROGRESS — conflict
    return Result.fail(idempotencyConflict(key));
  }

  /**
   * Marks the idempotency key as COMPLETED with the response payload.
   *
   * Call this after the operation succeeds so subsequent retries
   * replay the cached response instead of re-executing.
   *
   * Side effects:
   * - Updates the idempotency_keys row to COMPLETED.
   *
   * @param key - The raw idempotency key.
   * @param responseBody - The response payload to cache.
   * @param statusCode - The HTTP status code.
   * @returns OkResult(void) on success, or FailResult with INTERNAL_ERROR.
   */
  async markCompleted(
    key: string,
    responseBody: unknown,
    statusCode: number
  ): Promise<Result<void>> {
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    return this.repo.markCompleted(keyHash, responseBody, statusCode);
  }

  /**
   * Marks the idempotency key as UNRESOLVED.
   *
   * Call this when the operation fails partway through so subsequent
   * retries can attempt the operation again (UNRESOLVED allows proceed).
   *
   * Side effects:
   * - Updates the idempotency_keys row to UNRESOLVED.
   *
   * @param key - The raw idempotency key.
   * @returns OkResult(void) on success, or FailResult with INTERNAL_ERROR.
   */
  async markUnresolved(key: string): Promise<Result<void>> {
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    return this.repo.markUnresolved(keyHash);
  }
}
