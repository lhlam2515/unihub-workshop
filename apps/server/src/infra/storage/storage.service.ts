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
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { Inject, Injectable } from "@nestjs/common";

import { storageErrors } from "@/shared/response/errors";
import { Result } from "@/shared/response/result";

import { STORAGE_CONFIG } from "./storage.constants";

import type { StorageConfig } from "./storage.config";

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly publicUrlPrefix: string;

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
    this.publicUrlPrefix = config.publicUrl.endsWith("/")
      ? config.publicUrl
      : `${config.publicUrl}/`;
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
   * Uploads a text/CSV payload to object storage.
   *
   * Designed for the CSV sync error quarantine pipeline — writes the
   * error CSV file so BTC users can download it via the admin UI.
   *
   * Business rules:
   * - The caller is responsible for providing a unique, deterministic key.
   *   No UUID prefix is added (unlike uploadFile which auto-generates one).
   * - Content is encoded as UTF-8.
   *
   * Side effects:
   * - Writes the text content to the configured S3 bucket.
   *
   * @param key - Object storage key (e.g. "errors/students_2025-05-06.csv").
   * @param content - Text/CSV content as a UTF-8 string.
   * @param contentType - MIME type (defaults to "text/csv; charset=utf-8").
   * @returns OkResult containing the full public URL, or FailResult (UPLOAD_FAILED).
   */
  async uploadText(
    key: string,
    content: string,
    contentType = "text/csv; charset=utf-8"
  ): Promise<Result<string>> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucketName,
          Key: key,
          Body: Buffer.from(content, "utf-8"),
          ContentType: contentType,
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
   * Downloads a file from object storage as a Readable stream.
   *
   * Designed for the Batch-Sequential CSV sync pipeline — the consumer
   * pipes the stream into a CSV parser and processes rows one at a time,
   * keeping memory usage constant regardless of file size.
   *
   * Business rules:
   * - Accepts either a full public URL or a raw storage key.
   * - Returns the SDK's native Readable stream — the consumer owns
   *   stream lifecycle (pipe, destroy, back-pressure).
   * - An empty file (0 bytes) returns a valid stream that emits `end`
   *   immediately — not an error.
   *
   * Side effects: Opens an HTTP connection to the S3 endpoint.
   *
   * @param keyOrUrl - Full public URL or raw storage key.
   * @returns OkResult containing the Readable stream, or FailResult
   *          (STORAGE_FILE_NOT_FOUND | STORAGE_DOWNLOAD_FAILED).
   */
  async getFileStream(keyOrUrl: string): Promise<Result<Readable>> {
    const key = this.extractKeyFromUrl(keyOrUrl);

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucketName,
          Key: key,
        })
      );

      if (!response.Body) {
        return Result.fail(storageErrors.fileNotFound(key));
      }

      return Result.ok(response.Body as Readable);
    } catch (err) {
      if (
        err instanceof NoSuchKey ||
        (err as { name?: string })?.name === "NoSuchKey"
      ) {
        return Result.fail(storageErrors.fileNotFound(key));
      }
      return Result.fail(storageErrors.downloadFailed(err));
    }
  }

  /**
   * Downloads a file from object storage as a Buffer.
   *
   * Designed for the Pipe-and-Filter AI summary pipeline — pdf-parse
   * accepts Buffer directly, so collecting the entire response into
   * memory avoids unnecessary stream-to-Buffer conversion in the consumer.
   *
   * Business rules:
   * - Accepts either a full public URL or a raw storage key.
   * - Collects all chunks into a single Buffer — callers should verify
   *   file size via upload validation (≤50MB for PDFs).
   * - An empty file (0 bytes) returns an empty Buffer — valid, not an error.
   *
   * Side effects: Opens an HTTP connection to the S3 endpoint.
   *
   * @param keyOrUrl - Full public URL or raw storage key.
   * @returns OkResult containing the file buffer, or FailResult
   *          (STORAGE_FILE_NOT_FOUND | STORAGE_DOWNLOAD_FAILED).
   */
  async getFileBuffer(keyOrUrl: string): Promise<Result<Buffer>> {
    const key = this.extractKeyFromUrl(keyOrUrl);

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucketName,
          Key: key,
        })
      );

      if (!response.Body) {
        return Result.fail(storageErrors.fileNotFound(key));
      }

      const body = response.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of body) {
        chunks.push(chunk as Buffer);
      }

      return Result.ok(Buffer.concat(chunks));
    } catch (err) {
      if (
        err instanceof NoSuchKey ||
        (err as { name?: string })?.name === "NoSuchKey"
      ) {
        return Result.fail(storageErrors.fileNotFound(key));
      }
      return Result.fail(storageErrors.downloadFailed(err));
    }
  }

  /**
   * Lists CSV files from object storage matching the given prefix.
   *
   * Returns keys sorted by LastModified descending (most recent first).
   * Only returns objects ending with ".csv".
   *
   * Designed for the CSV sync scheduler — nightly CRON scans for new
   * student CSV files uploaded to the configured S3 bucket.
   *
   * Side effects: Sends a ListObjectsV2 request to the S3 endpoint.
   *
   * @param prefix - Object key prefix to filter by (e.g. "students_").
   * @returns OkResult containing an array of matching object keys,
   *          or FailResult (STORAGE_DOWNLOAD_FAILED).
   */
  async listFiles(prefix: string): Promise<Result<string[]>> {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: prefix,
        })
      );

      const keys = (response.Contents ?? [])
        .filter((obj) => obj.Key?.endsWith(".csv"))
        .sort((a, b) => {
          const aTime = a.LastModified?.getTime() ?? 0;
          const bTime = b.LastModified?.getTime() ?? 0;
          return bTime - aTime;
        })
        .map((obj) => obj.Key as string);

      return Result.ok(keys);
    } catch (err) {
      return Result.fail(storageErrors.downloadFailed(err));
    }
  }

  /**
   * Extracts the object storage key from a full public URL or raw key.
   *
   * If the input starts with the configured `publicUrl` prefix, the prefix
   * is stripped to recover the object key. Otherwise the input is returned
   * as-is — it is already a raw storage key.
   *
   * @param url - Full public URL or raw storage key.
   * @returns The object key suitable for S3 operations.
   */
  public extractKeyFromUrl(url: string): string {
    return url.startsWith(this.publicUrlPrefix)
      ? url.slice(this.publicUrlPrefix.length)
      : url;
  }
}
