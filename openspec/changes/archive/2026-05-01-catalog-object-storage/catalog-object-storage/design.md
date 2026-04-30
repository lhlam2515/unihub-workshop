# Design: catalog-object-storage

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                 Presentation Layer                       │
│  DocumentsAdminController                                │
│  @UseInterceptors(FileInterceptor('file'))               │
│  @UploadedFile() file: Express.Multer.File               │
│  ─ Validates: PDF MIME, max 50MB                         │
└──────────────────────┬──────────────────────────────────┘
                       │ calls
┌──────────────────────▼──────────────────────────────────┐
│                 Business Layer                           │
│  DocumentsService.uploadDocument()                       │
│  1. Validate workshop exists                             │
│  2. StorageService.uploadFile(file) → public URL         │
│  3. workshopDocumentsRepo.create({ fileUrl, ... })       │
│  4. aiSummariesRepo.upsert(PENDING)                      │
│  5. Return DocumentResponseDto                           │
└──────────┬──────────────────┬───────────────────────────┘
           │                  │
┌──────────▼──────┐  ┌────────▼───────────────────────────┐
│  Data Access    │  │  Shared Infrastructure              │
│  WorkshopDocs   │  │  StorageService                     │
│  Repository     │  │  ─ uploadFile(file): Result<URL>    │
│  (Drizzle ORM)  │  │  ─ deleteFile(key): Result<void>    │
└─────────────────┘  │  ─ buildPublicUrl(key): string      │
                     │  Internal: @aws-sdk/client-s3       │
                     │  Target: Cloudflare R2              │
                     └────────────────────────────────────┘
```

## Layer Design

### 1. Shared Infrastructure: `src/shared/storage/`

```
src/shared/storage/
├── storage.module.ts       # NestJS dynamic module (global)
├── storage.service.ts      # Injectable service wrapping S3 client
├── storage.config.ts       # Config interface + env validation
└── storage.constants.ts    # Defaults (MAX_FILE_SIZE, ALLOWED_MIME_TYPES)
```

**`StorageService` API:**

```typescript
class StorageService {
  /**
   * Uploads a file buffer to object storage.
   * Generates a unique key: workshops/{workshopId}/{uuid}-{originalName}
   * @returns OkResult<string> with public URL, or FailResult (UPLOAD_FAILED)
   */
  async uploadFile(
    file: Express.Multer.File,
    workshopId: string
  ): Promise<Result<string>>

  /**
   * Deletes a file from object storage by its key.
   * @returns OkResult<void>, or FailResult (FILE_NOT_FOUND / DELETE_FAILED)
   */
  async deleteFile(key: string): Promise<Result<void>>

  /**
   * Extracts the storage key from a stored public URL.
   * Inverse of buildPublicUrl — strips the R2_PUBLIC_URL prefix.
   */
  private extractKeyFromUrl(url: string): string
}
```

**`StorageConfig`:**

```typescript
interface StorageConfig {
  endpoint: string;          // R2 endpoint (e.g. https://<account>.r2.cloudflarestorage.com)
  region: string;            // "auto" for R2, otherwise AWS region
  accessKeyId: string;       // R2 Access Key ID
  secretAccessKey: string;   // R2 Secret Access Key
  bucketName: string;        // R2 bucket name
  publicUrl: string;         // Public base URL (e.g. https://pub-<hash>.r2.dev)
  maxFileSizeBytes: number;  // Default 52_428_800 (50MB)
}
```

**Dependency injection flow:**

```typescript
// storage.module.ts
@Global()
@Module({})
export class StorageModule {
  static forRoot(config: StorageConfig): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        { provide: STORAGE_CONFIG, useValue: config },
        StorageService,
      ],
      exports: [StorageService],
    };
  }
}
```

Import into `AppModule`:
```typescript
StorageModule.forRoot({
  endpoint: process.env.R2_ENDPOINT,
  region: process.env.R2_REGION ?? 'auto',
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME,
  publicUrl: process.env.R2_PUBLIC_URL,
  maxFileSizeBytes: parseInt(process.env.UPLOAD_MAX_FILE_SIZE ?? '52428800', 10),
})
```

### 2. Business Layer: `DocumentsService` changes

**Current flow (placeholder):**
```typescript
const fileUrl = `placeholder://workshops/${workshopId}/${fileName}`;
```

**New flow (with StorageService):**
```typescript
constructor(
  private readonly storageService: StorageService,  // NEW dependency
  // ... existing repos
) {}

async uploadDocument(workshopId, file, uploadedBy): Promise<Result<WorkshopDocumentResponseDto>> {
  // 1. Validate workshop exists (unchanged)
  // 2. Upload to R2 via StorageService
  const uploadResult = await this.storageService.uploadFile(file, workshopId);
  if (uploadResult.isFailure) return Result.fail(uploadResult.error);
  // 3. Persist metadata with the REAL URL
  const documentData: NewWorkshopDocument = {
    workshopId,
    fileUrl: uploadResult.data,        // ← real URL from R2
    originalName: file.originalname,   // ← from Multer file
    fileSizeBytes: file.size,          // ← from Multer file
    uploadStatus: "UPLOADED",
    uploadedBy,
  };
  // 4. Insert document + upsert AI summary (unchanged)
}
```

### 3. Presentation Layer: `DocumentsAdminController` changes

**Current:**
```typescript
@Post()
async uploadDocument(
  @Param("workshopId") workshopId: string,
  @Body() body: any,                              // ← no file handling
  @CurrentUser() user: JwtPayload
) {
  return this.documentsService.uploadDocument(workshopId, body, user.sub);
}
```

**New:**
```typescript
@Post()
@UseInterceptors(FileInterceptor('file'))
async uploadDocument(
  @Param("workshopId") workshopId: string,
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),   // 50MB
        new FileTypeValidator({ fileType: 'application/pdf' }),     // PDF only
      ],
    }),
  )
  file: Express.Multer.File,
  @CurrentUser() user: JwtPayload
) {
  return this.documentsService.uploadDocument(workshopId, file, user.sub);
}
```

## Data Flow (Upload Sequence)

```
1. Client → POST /admin/workshops/:id/documents
   Content-Type: multipart/form-data
   Body: file=<PDF binary>

2. FileInterceptor extracts file from multipart → Express.Multer.File { buffer, originalname, size, mimetype }

3. ParseFilePipe validates:
   - MaxFileSizeValidator: file.size <= 52_428_800
   - FileTypeValidator: file.mimetype === 'application/pdf'
   On failure → throws BadRequestException (handled by GlobalExceptionFilter)

4. Controller calls documentsService.uploadDocument(workshopId, file, userId)

5. DocumentsService:
   a. Validates workshop exists (existing logic)
   b. storageService.uploadFile(file, workshopId):
      - Build key: workshops/{workshopId}/{uuid}-{originalname}
      - S3 PutObject: Bucket=R2_BUCKET, Key=key, Body=file.buffer, ContentType='application/pdf'
      - Return: R2_PUBLIC_URL + "/" + key → full public URL
   c. Persist document metadata in workshop_documents (fileUrl = public URL)
   d. Upsert ai_summaries with PENDING status

6. Response: 201 WorkshopDocumentResponseDto { document_id, file_url, original_name, file_size_bytes, upload_status, uploaded_at }
```

## Error Handling

| Failure Point | Error Code | HTTP Status | Recovery |
|--------------|-----------|-------------|----------|
| File too large | 413 Payload Too Large | 413 | Client retry with smaller file |
| Not a PDF | VALIDATION_FAILED | 400 | Client resubmit correct format |
| Workshop not found | WORKSHOP_NOT_FOUND | 404 | Client fix workshop ID |
| S3 upload fails | UPLOAD_FAILED | 502 | Client retry; DB not written (no orphan URL) |
| DB insert fails | INTERNAL_ERROR | 500 | Manual cleanup of uploaded S3 object |

The DB insert happens AFTER successful S3 upload. If DB insert fails, the uploaded S3 object is orphaned — acceptable trade-off (low probability, object is idempotent by UUID key).

## Configuration

### `.env` additions

```bash
# Cloudflare R2 (S3-compatible)
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_REGION=auto
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_BUCKET_NAME=unihub-workshop-documents
R2_PUBLIC_URL=https://pub-<hash>.r2.dev

# Upload limits
UPLOAD_MAX_FILE_SIZE=52428800
```

### Validation at startup

`StorageModule.forRoot()` validates that all required env vars are present. Missing vars → startup failure with clear error message (fail-fast principle).

## Testing Notes

- `StorageService` unit tests: mock S3 client, verify key generation, verify PutObject params
- `DocumentsService` unit tests: mock StorageService + repos, verify orchestration
- Integration test: spin up MinIO container, test full upload flow
- Tests deferred to Priority 3 (testing phase per roadmap)
