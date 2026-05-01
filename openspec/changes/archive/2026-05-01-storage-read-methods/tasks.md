# Tasks: storage-read-methods

## Task List

- [x] 1. Add new error codes and factories for storage read operations
- [x] 2. Make `extractKeyFromUrl()` public and add `resolveKey()` helper
- [x] 3. Implement `getFileStream()` with `GetObjectCommand` — returns `Readable` stream
- [x] 4. Implement `getFileBuffer()` with `GetObjectCommand` — returns `Buffer`
- [x] 5. Add `getDocumentStream()` to `DocumentsService`
- [x] 6. Add `GET /:documentId/download` endpoint to `DocumentsAdminController`
- [x] 7. Build and lint verification

---

## Task 1: Add new error codes and factories

**Files:**
- `apps/server/src/shared/response/types.ts` — add `STORAGE_FILE_NOT_FOUND`, `STORAGE_DOWNLOAD_FAILED` to `ErrorCode`
- `apps/server/src/shared/response/errors.ts` — add `storageErrors.fileNotFound()`, `downloadFailed()` factories

### 1.1 Add ErrorCode entries

Insert these in the types union:

```typescript
| "STORAGE_FILE_NOT_FOUND"
| "STORAGE_DOWNLOAD_FAILED"
```

### 1.2 Add error factories in errors.ts

Append to the existing `storageErrors` factory group (before the `as const`):

```typescript
/**
 * Create an error when a file is not found in object storage.
 *
 * @param key - The storage key that was requested.
 * @returns Not found error payload.
 * @throws Never. Returns an error object instead of throwing.
 */
fileNotFound: (key: string): AppError =>
  createError({
    category: "NOT_FOUND",
    code: "STORAGE_FILE_NOT_FOUND",
    message: `File not found in storage: ${key}.`,
    context: { key },
  }),

/**
 * Create an error when downloading a file from storage fails.
 *
 * @param cause - Original S3 error for internal diagnostics.
 * @returns External dependency error payload.
 * @throws Never. Returns an error object instead of throwing.
 */
downloadFailed: (cause?: unknown): AppError =>
  createError({
    category: "EXTERNAL",
    code: "STORAGE_DOWNLOAD_FAILED",
    message: "Failed to download file from storage service.",
    cause,
  }),
```

**Verification:** `pnpm check-types --filter=server` passes

---

## Task 2: Make `extractKeyFromUrl()` public and add `resolveKey()` helper

**Files:**
- `apps/server/src/shared/storage/storage.service.ts`

### 2.1 Change access modifier

Change `extractKeyFromUrl` from `private` to `public`. Update its JSDoc to document the URL/key dual-input behavior:

```typescript
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
  const prefix = this.config.publicUrl.endsWith("/")
    ? this.config.publicUrl
    : `${this.config.publicUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}
```

### 2.2 Add `resolveKey()` private helper

Add a private wrapper that delegates to `extractKeyFromUrl`. This makes the dual-input intent explicit in the read methods:

```typescript
/**
 * Resolves a storage key from either a full public URL or a raw key.
 *
 * Delegates to {@link extractKeyFromUrl} — if the input starts with the
 * `publicUrl` prefix, the prefix is stripped; otherwise the input is
 * returned as-is.
 *
 * @param input - Full public URL or raw storage key.
 * @returns The object key for S3 operations.
 */
private resolveKey(input: string): string {
  return this.extractKeyFromUrl(input);
}
```

**Verification:** `pnpm check-types --filter=server` passes

---

## Task 3: Implement `getFileStream()` with `GetObjectCommand`

**Files:**
- `apps/server/src/shared/storage/storage.service.ts`

### 3.1 Add imports

Add to `@aws-sdk/client-s3` imports:

```typescript
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,    // NEW
  NoSuchKey,           // NEW — S3 error class for 404
} from "@aws-sdk/client-s3";
```

Add to `node` imports:

```typescript
import { Readable } from "node:stream";
```

### 3.2 Implement `getFileStream()`

Add after `deleteFile()`:

```typescript
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
  const key = this.resolveKey(keyOrUrl);

  try {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      })
    );

    return Result.ok(response.Body as Readable);
  } catch (err) {
    if (err instanceof NoSuchKey || (err as any)?.name === "NoSuchKey") {
      return Result.fail(storageErrors.fileNotFound(key));
    }
    return Result.fail(storageErrors.downloadFailed(err));
  }
}
```

**Verification:** `pnpm check-types --filter=server` passes

---

## Task 4: Implement `getFileBuffer()` with `GetObjectCommand`

**Files:**
- `apps/server/src/shared/storage/storage.service.ts`

### 4.1 Implement `getFileBuffer()`

Add after `getFileStream()`:

```typescript
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
  const key = this.resolveKey(keyOrUrl);

  try {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      })
    );

    const body = response.Body as Readable;
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      chunks.push(chunk as Buffer);
    }

    return Result.ok(Buffer.concat(chunks));
  } catch (err) {
    if (err instanceof NoSuchKey || (err as any)?.name === "NoSuchKey") {
      return Result.fail(storageErrors.fileNotFound(key));
    }
    return Result.fail(storageErrors.downloadFailed(err));
  }
}
```

**Note:** Uses `for await...of` on the SDK Readable — Node.js 18+ supports async iteration on `Readable` natively. No extra stream utility packages needed.

**Verification:** `pnpm check-types --filter=server` passes

---

## Task 5: Add `getDocumentStream()` to `DocumentsService`

**Files:**
- `apps/server/src/modules/catalog/services/documents.service.ts`

### 5.1 Implement `getDocumentStream()`

Add after `retryAiSummary()`:

```typescript
/**
 * Retrieves a document's file stream for download from object storage.
 *
 * Business rules:
 * - Verifies the document exists and belongs to the specified workshop.
 * - Delegates to StorageService.getFileStream() for the actual download —
 *   the returned stream is the S3 SDK's native body stream.
 *
 * Side effects: Opens an HTTP connection to the S3 endpoint.
 *
 * @param workshopId - The UUID of the parent workshop.
 * @param documentId - The UUID of the document to download.
 * @returns OkResult with { stream, filename, mimeType }, or FailResult
 *          (WORKSHOP_NOT_FOUND | STORAGE_FILE_NOT_FOUND | STORAGE_DOWNLOAD_FAILED).
 */
async getDocumentStream(
  workshopId: string,
  documentId: string
): Promise<
  Result<{ stream: Readable; filename: string; mimeType: string }>
> {
  const docResult = await this.documentsRepo.findById(documentId);
  if (docResult.isFailure) return Result.fail(docResult.error);
  if (!docResult.data)
    return Result.fail(workshopErrors.notFound(documentId));

  if (docResult.data.workshopId !== workshopId) {
    return Result.fail(workshopErrors.notFound(documentId));
  }

  const streamResult = await this.storageService.getFileStream(
    docResult.data.fileUrl
  );
  if (streamResult.isFailure) return Result.fail(streamResult.error);

  return Result.ok({
    stream: streamResult.data,
    filename: docResult.data.originalName,
    mimeType: "application/pdf",
  });
}
```

**Add import:** Import `Readable` from `node:stream` at the top of the file.

```typescript
import { Readable } from "node:stream";
```

**Verification:** `pnpm check-types --filter=server` passes

---

## Task 6: Add `GET /:documentId/download` endpoint to `DocumentsAdminController`

**Files:**
- `apps/server/src/modules/catalog/controllers/documents-admin.controller.ts`

### 6.1 Add endpoint

Add BEFORE the existing `@Get("summary")` route (to avoid route conflicts — NestJS matches more specific routes first):

```typescript
/**
 * Downloads a document file.
 *
 * Route: GET /admin/workshops/:workshopId/documents/:documentId/download
 * Security: Requires ORGANIZER role (JwtAuthGuard + RolesGuard).
 * Streams the document from object storage directly to the HTTP response.
 * Uses @Res({ passthrough: true }) to set Content-Disposition headers
 * while still delegating the response body to NestJS's stream handling.
 *
 * @param workshopId - The UUID of the parent workshop.
 * @param documentId - The UUID of the document to download.
 * @param res - NestJS response object (passthrough mode).
 * @returns Readable stream piped to the HTTP response.
 */
@Get(":documentId/download")
async downloadDocument(
  @Param("workshopId") workshopId: string,
  @Param("documentId") documentId: string,
  @Res({ passthrough: true }) res: Response,
) {
  const result = await this.documentsService.getDocumentStream(
    workshopId,
    documentId,
  );

  if (result.isFailure) {
    throw new NotFoundException(result.error.message);
  }

  res.set({
    "Content-Type": result.data.mimeType,
    "Content-Disposition": `attachment; filename="${result.data.filename}"`,
  });

  return result.data.stream;
}
```

**Add imports:**

```typescript
import { Res, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
```

**Note:** `NotFoundException` is the only exception thrown in a controller — it's the standard NestJS way to short-circuit the response for file downloads when the service returns a failure. The stream path bypasses the `ResponseInterceptor` naturally (NestJS streams `Readable` return values), so the Result pattern handling isn't applicable here.

**Verification:** `pnpm check-types --filter=server` passes

---

## Task 7: Build and lint verification

**Files:** None — verification only.

### 7.1 Run verification pipeline

```bash
pnpm check-types --filter=server
pnpm lint --filter=server
pnpm build --filter=server
```

All three commands should pass cleanly — no type errors, no lint warnings, successful build.

---

## Dependencies

```
Task 1 (error codes + factories)
  └─► Task 2 (extractKeyFromUrl public + resolveKey helper)
       ├─► Task 3 (getFileStream) — uses storageErrors.fileNotFound() and resolveKey()
       │    └─► Task 5 (DocumentsService.getDocumentStream) — uses getFileStream()
       │         └─► Task 6 (DocumentsAdminController endpoint) — uses getDocumentStream()
       └─► Task 4 (getFileBuffer) — uses storageErrors.fileNotFound() and resolveKey()

Task 7 (build verification) ── depends on all tasks above
```

Execution order: 1 → 2 → 3 → 4 + 5 → 6 → 7
