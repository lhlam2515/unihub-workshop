# Proposal: catalog-object-storage

## Summary

Integrate Cloudflare R2 Object Storage (S3-compatible) for workshop document uploads. Replace the current placeholder URL (`placeholder://...`) and raw `@Body()` handling with Multer-based file interceptors and a shared `StorageService` wrapping `@aws-sdk/client-s3`.

## Motivation

- **Current state:** `DocumentsAdminController` receives `@Body() body: any` — no actual file upload. File URLs are synthetic (`placeholder://workshops/{wid}/{name}`). The Background module's AI summary pipeline cannot access real files.
- **Goal:** Enable real PDF upload to Cloudflare R2, persist the public URL in `workshop_documents`, and enable downstream consumers (AI summary worker, student downloads) to access files.

## Scope

### In-scope
1. **New shared infrastructure:** `src/shared/storage/storage.service.ts` — injectable service wrapping `@aws-sdk/client-s3` (upload, delete operations)
2. **Update DocumentsAdminController:** Add `@UseInterceptors(FileInterceptor('file'))` and `@UploadedFile()` for multipart file handling
3. **Update DocumentsService:** Call `StorageService.uploadFile()` → persist returned URL in DB
4. **File validation:** PDF MIME type only, configurable max file size (default 50MB)
5. **Add dependencies:** `@aws-sdk/client-s3`, `@types/multer`
6. **New env vars:** `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
7. **Update OpenSpec spec:** Add delta to `document-upload` spec — Multer interceptor, S3/R2 storage, file validation

### Out-of-scope (deferred)
- Room/Speaker Update/Delete endpoints
- COMPLETED workshop status transition cron
- Document download/view endpoint (consumed by Background module later)
- Presigned URLs

## Impact

| Area | Change |
|------|--------|
| `shared/storage/` | New — StorageService, StorageModule |
| `catalog/controllers/documents-admin.controller.ts` | Modified — FileInterceptor, UploadedFile |
| `catalog/services/documents.service.ts` | Modified — calls StorageService instead of placeholder |
| `catalog/dto/` | Possibly modified — upload input validation |
| `openspec/specs/document-upload/` | Delta — Multer + S3/R2 requirements |
| `package.json` | New deps: `@aws-sdk/client-s3`, `@types/multer` |
| `.env` / config | New vars: R2_* |

## Dependencies

None — independent of other modules. Cloudflare R2 account with bucket and API keys is external infrastructure.
