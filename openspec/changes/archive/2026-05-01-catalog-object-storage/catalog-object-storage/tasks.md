# Tasks: catalog-object-storage

## Task List

- [x] 1. Add dependencies and environment variables
- [x] 2. Create shared storage infrastructure (`src/shared/storage/`)
- [x] 3. Update `DocumentsService` to use `StorageService`
- [x] 4. Update `DocumentsAdminController` with Multer `FileInterceptor`
- [x] 5. Wire `StorageModule` into `AppModule`
- [x] 6. Build and lint validation

---

## Task 1: Add dependencies and environment variables

**Files:**

- `apps/server/package.json` — add `@aws-sdk/client-s3`, `@types/multer`

**Steps:**

1. Verify `@types/multer` and `@nestjs/platform-express` are available (Express + Multer come with NestJS platform-express; just need types)
2. Add `R2_*` env vars to `.env.example` or server `.env`
3. Ensure existing `@nestjs/platform-express` provides `FileInterceptor` and `ParseFilePipe`

**Verification:** `pnpm install` succeeds

---

## Task 2: Create shared storage infrastructure

**Files:**

- `apps/server/src/shared/storage/storage.service.ts` (NEW)
- `apps/server/src/shared/storage/storage.module.ts` (NEW)
- `apps/server/src/shared/storage/storage.config.ts` (NEW)
- `apps/server/src/shared/storage/storage.constants.ts` (NEW)
- `apps/server/src/shared/response/errors.ts` — add `storageErrors` factory

**Steps:**

### 2.1 `StorageService`

- Injectable class wrapping `S3Client` from `@aws-sdk/client-s3`
- Constructor receives `StorageConfig` via injection token
- `uploadFile(file: Express.Multer.File, workshopId: string): Promise<Result<string>>`
  - Generate key: `workshops/{workshopId}/{crypto.randomUUID()}-{sanitize originalName}`
  - `PutObjectCommand` with Bucket, Key, Body (file.buffer), ContentType
  - Return `OkResult(config.publicUrl + "/" + key)`
  - On S3 error → `Result.fail(storageErrors.uploadFailed(err))`
- `deleteFile(url: string): Promise<Result<void>>`
  - Extract key from URL (strip publicUrl prefix)
  - `DeleteObjectCommand`
  - On S3 error → `Result.fail(storageErrors.deleteFailed(err))`

### 2.2 `StorageModule`

- `@Global()` dynamic module with `forRoot(config: StorageConfig)`
- Validates required env vars at construction (fail-fast)
- Exports `StorageService`

### 2.3 Error codes

- Add `storageErrors` factory in `errors.ts`:
  - `UPLOAD_FAILED` (mapped to 502 BAD_GATEWAY)
  - `DELETE_FAILED` (mapped to 502 BAD_GATEWAY)

**Verification:** TypeScript compilation passes; `StorageService` can be injected

---

## Task 3: Update `DocumentsService` to use `StorageService`

**Files:**

- `apps/server/src/modules/catalog/services/documents.service.ts`

**Steps:**

1. Add `StorageService` as constructor dependency
2. In `uploadDocument()`:
   - Remove placeholder URL line
   - Call `this.storageService.uploadFile(file, workshopId)` before DB insert
   - Use real `file.originalname` and `file.size` from Multer file (not body fields)
   - Remove `UploadedFile` interface (replaced by `Express.Multer.File`)
3. In `deleteDocument()`:
   - Add call to `this.storageService.deleteFile(doc.fileUrl)` (fire-and-forget — don't block on storage errors)
4. Update `uploadDocument` signature: `Promise<Result<WorkshopDocumentResponseDto>>` unchanged

**Verification:** TypeScript compiles; service logic is correct

---

## Task 4: Update `DocumentsAdminController` with Multer `FileInterceptor`

**Files:**

- `apps/server/src/modules/catalog/controllers/documents-admin.controller.ts`

**Steps:**

1. Add imports: `UseInterceptors`, `UploadedFile` from `@nestjs/common`; `FileInterceptor` from `@nestjs/platform-express`; `ParseFilePipe`, `MaxFileSizeValidator`, `FileTypeValidator` from `@nestjs/common`
2. Update `uploadDocument()`:
   - Add `@UseInterceptors(FileInterceptor('file'))`
   - Replace `@Body() body: any` with `@UploadedFile(new ParseFilePipe({...})) file: Express.Multer.File`
   - Pass `file` (not `body`) to `documentsService.uploadDocument()`
3. Constants: `MAX_FILE_SIZE = 50 * 1024 * 1024` (50MB), `ALLOWED_MIME_TYPE = 'application/pdf'`

**Verification:** Controller decorators are valid; route still registered at `POST /admin/workshops/:workshopId/documents`

---

## Task 5: Wire `StorageModule` into `AppModule`

**Files:**

- `apps/server/src/app.module.ts`

**Steps:**

1. Import `StorageModule.forRoot({...})` with config from env vars
2. Read env vars: `R2_ENDPOINT`, `R2_REGION`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
3. Default `maxFileSizeBytes` to 52428800 (50MB) from `UPLOAD_MAX_FILE_SIZE` env var (optional)

**Verification:** App starts without errors; end-to-end callable

---

## Task 6: Build and lint validation

**Steps:**

1. `pnpm check-types` passes
2. `npx eslint` on changed files — clean
3. Fix any compilation or lint errors

**Verification:** Types compile, lint passes on modified files

---

## Dependencies

```
Task 1 (deps + env)
  └─► Task 2 (shared storage)
       └─► Task 3 (DocumentsService)
            └─► Task 4 (DocumentsController)
                 └─► Task 5 (AppModule)
                      └─► Task 6 (build + lint)
```

All tasks implemented sequentially (infrastructure → service → controller → wiring → verification).
