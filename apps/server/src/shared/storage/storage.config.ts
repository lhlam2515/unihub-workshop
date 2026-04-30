/**
 * Configuration for S3-compatible object storage (Cloudflare R2).
 *
 * All values are resolved at module initialization via `StorageModule.forRoot()`
 * — missing required values cause a fail-fast startup error.
 */
export interface StorageConfig {
  /** S3-compatible endpoint URL (e.g. https://<account>.r2.cloudflarestorage.com). */
  endpoint: string;
  /** Region identifier. Use `"auto"` for Cloudflare R2. */
  region: string;
  /** S3-compatible access key ID. */
  accessKeyId: string;
  /** S3-compatible secret access key. */
  secretAccessKey: string;
  /** Target bucket name. */
  bucketName: string;
  /** Public base URL for constructing object URLs. */
  publicUrl: string;
  /** Maximum allowed file size in bytes. Default 52_428_800 (50 MB). */
  maxFileSizeBytes: number;
}
