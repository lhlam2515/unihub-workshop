# Document Upload — Delta Spec

Purpose: Add real file upload via Multer interceptor and Cloudflare R2 object storage (S3-compatible), replacing the current placeholder URL approach.

## MODIFIED Requirements

### Requirement: Organizer uploads PDF document for a workshop

The system SHALL allow ORGANIZER to upload a PDF document associated with a workshop. The document SHALL be stored in Cloudflare R2 (or any S3-compatible object storage) via the shared `StorageService`, with only the public URL persisted in the database.

#### Scenario: Upload document
- **WHEN** ORGANIZER uploads a PDF via multipart/form-data with field name `file`
- **THEN** FileInterceptor extracts the file; ParseFilePipe validates PDF MIME type and max 50MB size; StorageService uploads to R2 under key `workshops/{workshopId}/{uuid}-{originalName}`; system creates a `workshop_documents` record with `file_url` set to the R2 public URL, `upload_status = UPLOADED`; creates an `ai_summaries` record with `status = PENDING`; and returns `WorkshopDocumentResponseDto`

#### Scenario: Upload non-PDF file
- **WHEN** ORGANIZER uploads a file that is not `application/pdf`
- **THEN** `FileTypeValidator` rejects the file, NestJS returns HTTP 400 with Body: { error: "VALIDATION_FAILED" }

#### Scenario: Upload file exceeding size limit
- **WHEN** ORGANIZER uploads a file larger than 50MB (52,428,800 bytes)
- **THEN** `MaxFileSizeValidator` rejects the file, NestJS returns HTTP 413 with Body: { error: "FILE_TOO_LARGE" }

#### Scenario: Upload to non-existent workshop
- **WHEN** ORGANIZER attempts to upload a document for a workshop ID that does not exist
- **THEN** system returns FailResult with WORKSHOP_NOT_FOUND

#### Scenario: Storage service upload failure
- **WHEN** `StorageService.uploadFile()` fails (network error, S3 error)
- **THEN** system returns FailResult with UPLOAD_FAILED; no database record is created

## ADDED Requirements

### Requirement: Shared StorageService for S3-compatible object storage

The system SHALL provide a shared, injectable `StorageService` in `src/shared/storage/` that wraps `@aws-sdk/client-s3` for uploading files to and deleting files from S3-compatible object storage (Cloudflare R2).

#### Scenario: Upload file to object storage
- **WHEN** `StorageService.uploadFile(file, workshopId)` is called with a valid `Express.Multer.File`
- **THEN** the service constructs a storage key `workshops/{workshopId}/{uuid}-{originalName}`, executes S3 `PutObject` with the file buffer and `ContentType: application/pdf`, and returns `OkResult<string>` containing the full public URL

#### Scenario: Delete file from object storage
- **WHEN** `StorageService.deleteFile(url)` is called with a valid public URL
- **THEN** the service extracts the storage key from the URL, executes S3 `DeleteObject`, and returns `OkResult<void>`

#### Scenario: Missing configuration at startup
- **WHEN** required environment variables (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, etc.) are not set
- **THEN** `StorageModule.forRoot()` throws a descriptive error at application startup (fail-fast)

### Requirement: File validation via ParseFilePipe

The system SHALL validate uploaded files at the controller level using NestJS `ParseFilePipe` with `MaxFileSizeValidator` and `FileTypeValidator`.

#### Scenario: PDF MIME type validation
- **WHEN** a file with MIME type other than `application/pdf` is uploaded
- **THEN** `FileTypeValidator` rejects the request with HTTP 400

#### Scenario: Max file size validation
- **WHEN** a file exceeding 50MB is uploaded
- **THEN** `MaxFileSizeValidator` rejects the request with HTTP 413
