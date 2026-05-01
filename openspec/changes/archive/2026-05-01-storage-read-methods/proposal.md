# Proposal: storage-read-methods

## Summary

Add read-oriented methods to the shared `StorageService` — currently it only supports `uploadFile()` and `deleteFile()`. Two new methods — `getFileStream(key)` for stream-based CSV processing and `getFileBuffer(key)` for PDF-based AI summarization — provide the read capabilities needed by the CSV student sync (Batch-Sequential pattern) and AI summary (Pipe-and-Filter pattern) background pipelines. As an immediate consumer, `DocumentsService.getDocumentStream()` enables the document download feature required by SCR-W19, completing the document management CRUD.

## Motivation

### 1. Document Download — Completing SCR-W19 (immediate consumer)
- **screens.md (SCR-W19):** Document list shows each file with a "link download" action. The organizer can click to download any previously uploaded PDF.
- **Current gap:** `DocumentsService` has `uploadDocument()`, `listDocuments()`, `deleteDocument()`, `getAiSummary()`, `retryAiSummary()` — but no `getDocumentStream()`. The download link on SCR-W19 has no backend endpoint.
- **Why this is the ideal first consumer:** Document download is the simplest integration point for `getFileStream()` — no CSV parsing, no AI pipeline, just stream the file from storage to the HTTP response. It validates the new storage read methods in a controlled, testable flow before the more complex background workers adopt them.

### 2. CSV Student Sync — Batch-Sequential Pattern (FR-F09-001, FR-F09-002)
- **screens.md (SCR-W27, SCR-W28):** Organizer triggers CSV import, system shows sync job status and per-row error details.
- **SRS (F09 - Student Data Synchronization):** Organizer uploads CSV to Object Storage, system reads it to upsert student records.
- **Pattern:** Batch-Sequential — parse CSV row by row via `readline` or `fast-csv`, process in batches of 100 rows, flush progress between batches. A single large CSV (potentially thousands of student rows) must not be loaded entirely into memory.
- **Current gap:** `StudentSyncService.processJob()` is stubbed — it needs `getFileStream(csvKey)` to obtain a `Readable` stream, pipe it through a CSV parser, validate headers, and stream-process rows without loading the entire file into RAM.
- **Why stream, not buffer:** CSV files may contain thousands of rows. Streaming allows the pipeline to:
  - Parse each line one at a time via `readline` or `fast-csv`
  - Process in batches of 100 rows, flushing progress after each batch
  - Abort mid-stream if malformed headers are detected (fail-fast)
  - Keep memory usage constant regardless of file size

### 3. AI Summary — Pipe-and-Filter Pattern (FR-F03-002)
- **screens.md (SCR-W19):** Document upload triggers AI summary generation with status tracking (PENDING → PROCESSING → DONE/FAILED).
- **SRS (F03 - Content & AI Pipeline):** System fetches PDF from Object Storage, extracts text, calls Claude API.
- **Pattern:** Pipe-and-Filter — data flows unidirectionally: `URL (string) → Buffer → string (PDF text) → string (cleaned) → string (summary) → DB record`. Each filter concerns itself only with its own input/output.
- **Current gap:** `AiSummaryService.processDocument()` is stubbed — it needs `getFileBuffer(pdfKey)` to download the PDF from storage as a `Buffer` before feeding it to `pdf-parse` for text extraction.
- **Why buffer, not stream:** PDF files are validated at upload to ≤50MB. `pdf-parse` works directly with `Buffer` — no intermediate conversion needed. Using stream would add unnecessary back-pressure management for a bounded-size workload. A single `for await` chunk collection is simpler and sufficient.

### 4. URL-to-key auto-detection
- Both `getFileStream` and `getFileBuffer` accept either a full public URL (from DB records) or a raw storage key.
- `extractKeyFromUrl()` already handles this — if the input starts with the `publicUrl` prefix, it strips it to recover the key; otherwise it returns the input as-is. Making this method `public` enables the read methods (and external consumers) to normalize any input transparently.

## Scope

### In-scope
1. **StorageService — `getFileStream(keyOrUrl)`** — Download a file from object storage as a `Readable` stream. Uses `GetObjectCommand`. Returns `Result<Readable>`. Accepts both URL and raw key. Designed for CSV sync (Batch-Sequential pattern) and document download.
2. **StorageService — `getFileBuffer(keyOrUrl)`** — Download a file from object storage as a `Buffer`. Uses `GetObjectCommand` + stream-to-buffer conversion. Returns `Result<Buffer>`. Accepts both URL and raw key. Designed for AI summary (Pipe-and-Filter pattern).
3. **StorageService — `extractKeyFromUrl(url)`** — Changed from `private` to `public` so consumers can independently derive keys from database-stored URLs.
4. **DocumentsService — `getDocumentStream(workshopId, docId)`** — Looks up a document, verifies it belongs to the workshop, then calls `storageService.getFileStream(doc.fileUrl)`. Returns `Result<{ stream: Readable; filename: string; mimeType: string }>`.
5. **DocumentsAdminController — `GET /admin/workshops/:id/documents/:docId/download`** — Streams the document file to the HTTP response.
6. **New error codes** — `STORAGE_FILE_NOT_FOUND`, `STORAGE_DOWNLOAD_FAILED`.
7. **Delta specs** — Update `document-upload` spec to cover read methods and document download.

### Out-of-scope (deferred)
- CSV upload endpoint — organizer still places CSV out-of-band or via a future endpoint
- Signed URL generation — not needed until frontend direct-upload requirements emerge
- `listFiles()` and `fileExists()` — keep the design simple; add when a concrete consumer needs them
- Unit tests — Priority 3

## Impact

| Area | Change |
|------|--------|
| `shared/storage/storage.service.ts` | Add `getFileStream()`, `getFileBuffer()`; make `extractKeyFromUrl()` public; add `resolveKey()` helper |
| `shared/response/types.ts` | Add `STORAGE_FILE_NOT_FOUND`, `STORAGE_DOWNLOAD_FAILED` |
| `shared/response/errors.ts` | Add `storageErrors.fileNotFound()`, `downloadFailed()` |
| `catalog/services/documents.service.ts` | Add `getDocumentStream()` — lookup + stream retrieval |
| `catalog/controllers/documents-admin.controller.ts` | Add `GET /:documentId/download` endpoint |

## Dependencies

- `@aws-sdk/client-s3` is already installed (provides `GetObjectCommand`)
- No new package dependencies
- `DocumentsService` already injects `StorageService` — no DI changes needed
