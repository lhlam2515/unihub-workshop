# Document Upload — Delta Spec (Storage Read Methods + Document Download)

Purpose: Extend the shared `StorageService` with read-oriented methods (`getFileStream`, `getFileBuffer`) and add document download to `DocumentsService`, completing the document management CRUD required by SCR-W19.

## MODIFIED Requirements

### Requirement: Shared StorageService for S3-compatible object storage

The system SHALL provide a shared, injectable `StorageService` that wraps `@aws-sdk/client-s3` for uploading, deleting, **and reading** files from S3-compatible object storage (Cloudflare R2).

#### Scenario: Download file as stream (HAPPY PATH)
- **GIVEN** a valid object key or public URL in storage
- **WHEN** `StorageService.getFileStream(keyOrUrl)` is called
- **THEN** the service resolves the input to a storage key (strips `publicUrl` prefix if present), executes S3 `GetObjectCommand`, and returns `OkResult<Readable>` containing the streaming response body

#### Scenario: Download file as stream via raw key
- **GIVEN** a raw storage key (e.g., `student-sync/students-2026.csv`) that does not start with the `publicUrl` prefix
- **WHEN** `StorageService.getFileStream(keyOrUrl)` is called
- **THEN** the service treats the input as-is (no prefix stripping), executes S3 `GetObjectCommand` with that key, and returns `OkResult<Readable>`

#### Scenario: Download file as buffer (HAPPY PATH)
- **GIVEN** a valid object key or public URL pointing to a PDF in storage
- **WHEN** `StorageService.getFileBuffer(keyOrUrl)` is called
- **THEN** the service resolves the input to a storage key, executes S3 `GetObjectCommand`, collects all chunks from the response body into a `Buffer`, and returns `OkResult<Buffer>` containing the full file contents

#### Scenario: Download file as buffer via raw key
- **GIVEN** a raw storage key that does not start with the `publicUrl` prefix
- **WHEN** `StorageService.getFileBuffer(keyOrUrl)` is called
- **THEN** the service treats the input as-is, executes S3 `GetObjectCommand` with that key, and returns `OkResult<Buffer>`

#### Scenario: Download non-existent file (stream)
- **GIVEN** an object key that does not exist in storage
- **WHEN** `StorageService.getFileStream(keyOrUrl)` is called
- **THEN** the service catches the S3 `NoSuchKey` error and returns `FailResult(STORAGE_FILE_NOT_FOUND)`

#### Scenario: Download non-existent file (buffer)
- **GIVEN** an object key that does not exist in storage
- **WHEN** `StorageService.getFileBuffer(keyOrUrl)` is called
- **THEN** the service catches the S3 `NoSuchKey` error and returns `FailResult(STORAGE_FILE_NOT_FOUND)`

#### Scenario: Download fails due to network error (stream)
- **GIVEN** the S3 endpoint is unreachable
- **WHEN** `StorageService.getFileStream(keyOrUrl)` is called
- **THEN** the service catches the connection error and returns `FailResult(STORAGE_DOWNLOAD_FAILED)`

#### Scenario: Download fails due to network error (buffer)
- **GIVEN** the S3 endpoint is unreachable
- **WHEN** `StorageService.getFileBuffer(keyOrUrl)` is called
- **THEN** the service catches the connection error and returns `FailResult(STORAGE_DOWNLOAD_FAILED)`

#### Scenario: Empty file download (stream)
- **GIVEN** a 0-byte object exists in storage
- **WHEN** `StorageService.getFileStream(keyOrUrl)` is called
- **THEN** the service returns `OkResult<Readable>` — the stream emits `end` immediately (no `data` events). The consumer processes zero rows — valid result, not an error.

#### Scenario: Empty file download (buffer)
- **GIVEN** a 0-byte object exists in storage
- **WHEN** `StorageService.getFileBuffer(keyOrUrl)` is called
- **THEN** the service returns `OkResult<Buffer>` containing an empty Buffer (`Buffer.alloc(0)`)

#### Scenario: Extract key from public URL
- **GIVEN** a public URL stored in the database (e.g., `https://pub.example.com/workshops/{wid}/{uuid}-file.pdf`)
- **WHEN** `StorageService.extractKeyFromUrl(url)` is called
- **THEN** the service strips the configured `publicUrl` prefix and returns the object key (e.g., `workshops/{wid}/{uuid}-file.pdf`)

#### Scenario: Extract key from raw key (pass-through)
- **GIVEN** a raw storage key (e.g., `student-sync/students-2026.csv`) that does not start with the `publicUrl` prefix
- **WHEN** `StorageService.extractKeyFromUrl(key)` is called
- **THEN** the service returns the input unchanged (no prefix match, pass-through behavior)

## ADDED Requirements

### Requirement: Organizer downloads uploaded document

The system SHALL allow ORGANIZER to download a previously uploaded document file via the `DocumentsService`, which delegates to `StorageService.getFileStream()`.

#### Scenario: Download existing document (HAPPY PATH)
- **GIVEN** a document exists in `workshop_documents` for the specified workshop
- **WHEN** `DocumentsService.getDocumentStream(workshopId, documentId)` is called
- **THEN** the service verifies the document belongs to the workshop, calls `StorageService.getFileStream(document.fileUrl)`, and returns `OkResult({ stream, filename, mimeType })`

#### Scenario: Download document from wrong workshop
- **GIVEN** a document exists but belongs to a different workshop
- **WHEN** `DocumentsService.getDocumentStream(workshopId, documentId)` is called with a non-matching workshopId
- **THEN** the service returns `FailResult(WORKSHOP_NOT_FOUND)` — the document's existence is not leaked (IDOR prevention)

#### Scenario: Download non-existent document
- **GIVEN** the document ID does not exist in the database
- **WHEN** `DocumentsService.getDocumentStream(workshopId, documentId)` is called
- **THEN** the service returns `FailResult(WORKSHOP_NOT_FOUND)`

#### Scenario: Document exists but storage file is missing
- **GIVEN** the document record exists in the database but the S3 object has been deleted
- **WHEN** `DocumentsService.getDocumentStream(workshopId, documentId)` is called
- **THEN** `StorageService.getFileStream()` returns `FailResult(STORAGE_FILE_NOT_FOUND)` and the error is propagated to the caller

### Requirement: New storage error codes for read operations

The system SHALL add two new error codes for storage read operations:

| Code | Category | HTTP | Description |
|------|---------|------|-------------|
| `STORAGE_FILE_NOT_FOUND` | NOT_FOUND | 404 | Requested object does not exist in storage |
| `STORAGE_DOWNLOAD_FAILED` | EXTERNAL | 502 | Failed to download object from storage |
