# Design: storage-read-methods

Architectural decisions for adding read-oriented methods to the shared `StorageService`.

---

## 1. Design Principle: Stream for CSV/Document, Buffer for PDF

The two read methods serve fundamentally different processing patterns and are optimized accordingly:

| Method | Return Type | Processing Pattern | Consumer | File Size |
|--------|-----------|-------------------|----------|-----------|
| `getFileStream(keyOrUrl)` | `Result<Readable>` | Batch-Sequential (row-by-row) / HTTP response streaming | `StudentSyncService`, `DocumentsService` | Potentially large (thousands of CSV rows); bounded (≤50MB PDF for download) |
| `getFileBuffer(keyOrUrl)` | `Result<Buffer>` | Pipe-and-Filter (full-file) | `AiSummaryService` | Bounded (≤50MB via upload validation) |

**Rationale for stream (CSV + document download):** CSV files may contain thousands of student rows — `getFileStream` returns the S3 response body as a `Readable` stream, allowing the pipeline to parse line-by-line without holding the entire file in memory. Document download also benefits from streaming to avoid buffering the entire file before sending the HTTP response.

**Rationale for buffer (PDF → AI):** PDF files are validated at upload to ≤50MB. `pdf-parse` accepts `Buffer` directly — no intermediate conversion. A single call to `getFileBuffer` fetches the entire document into memory and feeds the next filter in the Pipe-and-Filter chain: `URL → Buffer → string (PDF text) → string (cleaned) → string (summary) → DB record`.

---

## 2. Method: `getFileStream(keyOrUrl)`

### 2.1 SDK Usage

**Decision:** Use `GetObjectCommand` from `@aws-sdk/client-s3`. The response `.Body` is an SDK `Readable` stream — return it directly without buffering.

```typescript
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

**Key design choices:**
- The stream is the S3 SDK's own `Readable` — no wrapping, no buffering, no `PassThrough` proxy
- The consumer owns stream lifecycle: `StudentSyncService` pipes it into a CSV parser; `DocumentsService` passes it to NestJS for HTTP response piping
- If the consumer destroys the stream (e.g., bad header detected, client disconnects), S3 SDK handles cleanup of the underlying HTTP connection

### 2.2 Consumer Usage: `StudentSyncService.processJob()`

```typescript
const streamResult = await this.storageService.getFileStream(fileUrl);
if (streamResult.isFailure) return Result.fail(streamResult.error);

const stream = streamResult.data;
const csvParser = createReadStream()
  .pipe(csv.parse({ headers: true }));

let batch: any[] = [];
for await (const row of csvParser) {
  batch.push(row);
  if (batch.length >= 100) {
    await this.processBatch(batch); // upsert 100 rows
    batch = [];
  }
}
if (batch.length > 0) await this.processBatch(batch);
```

### 2.3 Consumer Usage: `DocumentsService.getDocumentStream()`

```typescript
async getDocumentStream(workshopId: string, documentId: string):
  Promise<Result<{ stream: Readable; filename: string; mimeType: string }>> {

  // 1. Look up document
  const docResult = await this.documentsRepo.findById(documentId);
  if (docResult.isFailure) return Result.fail(docResult.error);
  if (!docResult.data) return Result.fail(workshopErrors.notFound(documentId));

  // 2. Verify document belongs to workshop (IDOR prevention)
  if (docResult.data.workshopId !== workshopId) {
    return Result.fail(workshopErrors.notFound(documentId));
  }

  // 3. Get stream from storage
  const streamResult = await this.storageService.getFileStream(docResult.data.fileUrl);
  if (streamResult.isFailure) return Result.fail(streamResult.error);

  return Result.ok({
    stream: streamResult.data,
    filename: docResult.data.originalName,
    mimeType: "application/pdf",
  });
}
```

The controller then pipes the stream to the HTTP response using `@Res({ passthrough: true })` — the standard NestJS pattern for file downloads where the response body is streamed but headers are set declaratively.

### 2.4 Error Handling

| Scenario | Error Returned |
|----------|---------------|
| `NoSuchKey` (404) from S3 | `FailResult(STORAGE_FILE_NOT_FOUND)` |
| Network error, connection timeout | `FailResult(STORAGE_DOWNLOAD_FAILED)` |
| Empty file (0 bytes) | `OkResult` — stream emits `end` immediately, no rows/corrupt PDF — valid |

---

## 3. Method: `getFileBuffer(keyOrUrl)`

### 3.1 SDK Usage

**Decision:** Same `GetObjectCommand`, but collect the stream into a `Buffer` using `for await` chunk accumulation.

```typescript
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

**Key design choices:**
- Uses `for await...of` on the SDK `Readable` to collect chunks — Node.js 18+ supports async iteration on `Readable` natively
- `Buffer.concat` is efficient for the ≤50MB range — no streaming back-pressure needed
- Returns the buffer ready for `pdf-parse(buffer)` — zero intermediate transforms for the consumer

### 3.2 Consumer Usage: `AiSummaryService.processDocument()`

```typescript
// Inside AiSummaryService.extractTextFromPdf():
const fileResult = await this.storageService.getFileBuffer(fileUrl);
if (fileResult.isFailure) {
  return Result.fail(fileResult.error); // Short-circuit the pipeline
}

const rawText = await pdfParse(fileResult.data); // Buffer → text
// Continue Pipeline: clean text → call Claude → save summary
```

Data flow: `URL (string) → Buffer → string (PDF text) → string (cleaned) → string (summary) → DB record`

### 3.3 Error Handling

Same as `getFileStream` — two distinct failure paths:
1. `NoSuchKey` → `STORAGE_FILE_NOT_FOUND`
2. Any other SDK error → `STORAGE_DOWNLOAD_FAILED`

In the AI pipeline context, both are treated as failures (short-circuit the filter chain).

---

## 4. URL-to-Key Resolution

### 4.1 Design

Both `getFileStream` and `getFileBuffer` accept a `keyOrUrl` parameter — either a full public URL or a raw storage key. The existing `extractKeyFromUrl()` logic handles both cases transparently:

```typescript
private resolveKey(input: string): string {
  return this.extractKeyFromUrl(input);
}
```

`extractKeyFromUrl` is changed from `private` to `public` — consumers outside StorageService can also use it independently:

```typescript
/**
 * Extracts the object storage key from a full public URL or raw key.
 *
 * If the input starts with the configured `publicUrl` prefix, the prefix
 * is stripped to recover the object key. Otherwise the input is returned
 * as-is — it is already a raw storage key.
 *
 * @param url - Full public URL or raw storage key.
 * @returns The object key for S3 operations.
 */
public extractKeyFromUrl(url: string): string {
  const prefix = this.config.publicUrl.endsWith("/")
    ? this.config.publicUrl
    : `${this.config.publicUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}
```

**Why this works for both URL and raw key:**
- `file_url` in `workshop_documents` points to `https://pub-xxx.r2.dev/workshops/{wid}/{uuid}-file.pdf` → starts with prefix → key extracted
- Raw key `student-sync/students-2026.csv` → does NOT start with `https://pub-xxx.r2.dev/` → returned as-is
- `extractKeyFromUrl` already handles the non-matching case by returning the input unchanged

---

## 5. New Error Codes

Two new codes added to `ErrorCode` type:

| Code | Category | HTTP | Factory | When |
|------|---------|------|---------|------|
| `STORAGE_FILE_NOT_FOUND` | NOT_FOUND | 404 | `storageErrors.fileNotFound(key)` | S3 returns `NoSuchKey` / HTTP 404 |
| `STORAGE_DOWNLOAD_FAILED` | EXTERNAL | 502 | `storageErrors.downloadFailed(err)` | Any other S3 error (network, timeout, etc.) |

---

## 6. DocumentsService: `getDocumentStream()` Integration

### 6.1 Why DocumentsService needs to proxy through StorageService

`DocumentsService` already injects `StorageService`. Adding `getDocumentStream()` follows the existing pattern:

```
DocumentsAdminController
  → DocumentsService.getDocumentStream(workshopId, documentId)
    → StorageService.getFileStream(fileUrl)
      → S3 GetObjectCommand
```

The service layer is responsible for:
1. **Ownership verification:** Document must belong to the specified workshop (IDOR prevention for organizer resources)
2. **Delegation:** Calling `storageService.getFileStream()` with the document's stored `file_url`
3. **Result pass-through:** If storage returns a failure, propagate it up

### 6.2 Controller: `@Res({ passthrough: true })` for file download

The download endpoint is the one case where `@Res({ passthrough: true })` is warranted — NestJS requires it to set `Content-Disposition` on streaming responses. The `passthrough: true` variant still lets NestJS handle the response body, unlike bare `@Res()`.

```typescript
@Get(":documentId/download")
async downloadDocument(
  @Param("workshopId") workshopId: string,
  @Param("documentId") documentId: string,
  @Res({ passthrough: true }) res: Response,
) {
  const result = await this.documentsService.getDocumentStream(workshopId, documentId);

  if (result.isFailure) {
    // Map storage/app errors to HTTP
    throw new NotFoundException(result.error.message);
  }

  res.set({
    "Content-Type": result.data.mimeType,
    "Content-Disposition": `attachment; filename="${result.data.filename}"`,
  });

  return result.data.stream;
}
```

**Why this approach:**
- NestJS automatically pipes `Readable` streams to the response when returned from a controller
- `@Res({ passthrough: true })` sets headers without taking over response lifecycle
- Error handling stays in the controller — service failures are checked before streaming begins
- The stream is returned as the body without buffering

### 6.3 Route design

**Decision:** `GET /admin/workshops/:workshopId/documents/:documentId/download` — consistent with the existing `:workshopId/documents` prefix.

The `:documentId/download` suffix avoids ambiguity with the existing `GET :documentId` route and follows REST conventions for a non-CRUD action on a resource. It is placed BEFORE the `@Get("summary")` route in the controller to avoid route conflicts (NestJS matches more specific routes first).

---

## 7. No Business Logic in StorageService

StorageService is an **infrastructure concern** — it fetches objects from S3 and returns raw data (stream or buffer). All business logic belongs to the consumer services:

| Concern | Responsibility |
|---------|---------------|
| Document ownership verification | `DocumentsService.getDocumentStream()` |
| CSV header validation | `StudentSyncService` |
| Row-by-row parsing, batching | `StudentSyncService` |
| PDF text extraction | `AiSummaryService.processDocument()` via `pdf-parse` |
| Text cleaning, normalization | `AiSummaryService.cleanAndNormalizeText()` |
| LLM API call | `AiSummaryService.callClaudeApi()` |

This is the Single Responsibility Principle applied to the Layered Architecture — StorageService is a shared infrastructure utility, not a domain service.

---

## 8. Files Summary

| Action | File | Purpose |
|--------|------|---------|
| MODIFY | `shared/storage/storage.service.ts` | Add `getFileStream()`, `getFileBuffer()`, `resolveKey()`; change `extractKeyFromUrl` from `private` to `public` |
| MODIFY | `shared/response/types.ts` | Add `STORAGE_FILE_NOT_FOUND`, `STORAGE_DOWNLOAD_FAILED` codes |
| MODIFY | `shared/response/errors.ts` | Add `storageErrors.fileNotFound()`, `downloadFailed()` factories |
| MODIFY | `catalog/services/documents.service.ts` | Add `getDocumentStream()` — lookup + stream retrieval |
| MODIFY | `catalog/controllers/documents-admin.controller.ts` | Add `GET /:documentId/download` endpoint |
