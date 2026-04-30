/**
 * Storage Service
 *
 * Injectable wrapper around `@aws-sdk/client-s3` (S3Client) for uploading files
 * to and deleting files from S3-compatible object storage (Cloudflare R2).
 *
 * This is the **only layer** in the system permitted to interact directly with
 * the S3 API. Business-layer Services consume only the primitives exposed here.
 *
 * Design rationale:
 * - Centralizes S3 client configuration (endpoint, credentials, region) so
 *   individual services never deal with raw S3 commands.
 * - Generates deterministic object keys following the convention
 *   `workshops/{workshopId}/{uuid}-{sanitizedOriginalName}`.
 *
 * Lifecycle:
 * - **Startup:** S3Client is created in the constructor — lightweight, no
 *   persistent connection. The SDK handles connection pooling internally.
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Inject, Injectable } from "@nestjs/common";

import { storageErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { STORAGE_CONFIG } from "./storage.constants";

import type { StorageConfig } from "./storage.config";

@Injectable()
export class StorageService {
  private readonly client: S3Client;

  constructor(@Inject(STORAGE_CONFIG) private readonly config: StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  /**
   * Uploads a file buffer to object storage.
   *
   * Generates a unique object key:
   * `workshops/{workshopId}/{uuid}-{sanitizedOriginalName}`.
   *
   * Business rules:
   * - The key is globally unique per upload (UUID prefix per file).
   * - Original filename is sanitised — only alphanumeric, dots, hyphens,
   *   and underscores are preserved; all other characters are replaced
   *   with underscores.
   *
   * Side effects:
   * - Writes the file buffer to the configured S3 bucket.
   *
   * @param file - Express Multer file object containing buffer and metadata.
   * @param workshopId - UUID of the workshop the document belongs to.
   * @returns OkResult containing the full public URL, or FailResult (UPLOAD_FAILED).
   */
  async uploadFile(
    file: Express.Multer.File,
    workshopId: string
  ): Promise<Result<string>> {
    const { randomUUID } = await import("node:crypto");
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `workshops/${workshopId}/${randomUUID()}-${safeName}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      return Result.ok(`${this.config.publicUrl}/${key}`);
    } catch (err) {
      return Result.fail(storageErrors.uploadFailed(err));
    }
  }

  /**
   * Deletes a file from object storage by its public URL.
   *
   * Business rules:
   * - The storage key is extracted from the URL by stripping the
   *   `publicUrl` prefix.
   * - Failures are intentionally **not propagated** to callers — storage
   *   deletion is a fire-and-forget concern. The database record is the
   *   source of truth; orphaned storage objects are tolerable.
   *
   * Side effects:
   * - Removes the object from the configured S3 bucket.
   *
   * @param url - Full public URL of the object to delete.
   * @returns OkResult with void on success, or FailResult (DELETE_FAILED).
   */
  async deleteFile(url: string): Promise<Result<void>> {
    const key = this.extractKeyFromUrl(url);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucketName,
          Key: key,
        })
      );

      return Result.ok();
    } catch (err) {
      return Result.fail(storageErrors.deleteFailed(err));
    }
  }

  /**
   * Extracts the storage object key from a public URL.
   *
   * The public URL is the base `publicUrl` followed by `/` followed by the
   * object key (e.g. `https://pub-<hash>.r2.dev/workshops/{wid}/{uuid}-{name}`).
   * This method strips the `publicUrl` + `/` prefix to recover the key.
   *
   * @param url - Full public URL stored in the database.
   * @returns The object key suitable for S3 operations.
   */
  private extractKeyFromUrl(url: string): string {
    const prefix = this.config.publicUrl.endsWith("/")
      ? this.config.publicUrl
      : `${this.config.publicUrl}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : url;
  }
}
