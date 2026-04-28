# UniHub Workshop — Danh sách Component Cần Triển Khai

> **Phiên bản:** 1.0 | **Nguồn gốc:** Architecture Design, OpenAPI Spec, Access Control Doc, Schema SQL
> **Quy ước đặt tên:** `kebab-case` cho file, `PascalCase` cho class, `camelCase` cho method.

---

## Mục lục

1. [Conventions & Templates](#1-conventions--templates)
2. [Core Guards & Decorators](#2-core-guards--decorators)
3. [Shared Infrastructure](#3-shared-infrastructure)
4. [Module IAM](#4-module-iam-srcmodulesiam)
5. [Module Catalog](#5-module-catalog-srcmodulescatalog)
6. [Module Booking](#6-module-booking-srcmodulesbooking)
7. [Module Check-in](#7-module-check-in-srcmodulescheckin)
8. [Module Background](#8-module-background-srcmodulesbackground)

---

## 1. Conventions & Templates

### 1.1 Controller Convention

**Quy tắc:**

- **File naming:** `{resource}.controller.ts` hoặc `{resource}-{scope}.controller.ts` (ví dụ: `workshops-admin.controller.ts`)
- **Class naming:** `{Resource}Controller` hoặc `{Resource}{Scope}Controller`
- **Scope phân biệt:** Dùng prefix `Admin` cho controller phục vụ ORGANIZER/admin route (`/admin/*`)
- **Nguyên tắc thin controller:** Controller **không chứa logic nghiệp vụ**. Toàn bộ công việc của controller là: (1) nhận DTO đã được validate, (2) gọi service, (3) return `Result<T>` — ResponseInterceptor xử lý phần còn lại.
- **Guard attachment:** Guards được gắn ở cấp Controller class (`@UseGuards()`), các endpoint ngoại lệ (PUBLIC) gắn `@Public()` decorator riêng.

```typescript
// Template: src/modules/{module}/controllers/{resource}.controller.ts
import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '@core/guards/jwt-auth.guard';
import { RolesGuard } from '@core/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { UserRole } from '@database/types';
import { {Resource}Service } from '../services/{resource}.service';
import { Create{Resource}Dto } from '../dto/create-{resource}.dto';
import { Result } from '@shared/response/result';
import { {Resource}ResponseDto } from '../dto/{resource}-response.dto';

@Controller('{route-prefix}')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANIZER) // Gắn role mặc định ở class level nếu toàn bộ route cùng role
export class {Resource}Controller {
  constructor(private readonly {resource}Service: {Resource}Service) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create{Resource}(
    @Body() dto: Create{Resource}Dto,
    @CurrentUser() user: JwtPayload,
  ): Promise<Result<{Resource}ResponseDto>> {
    return this.{resource}Service.create(dto, user);
    // ResponseInterceptor sẽ unwrap Result và format ApiResponse<T>
  }
}
```

---

### 1.2 Service Convention

**Quy tắc:**

- **File naming:** `{resource}.service.ts`
- **Class naming:** `{Resource}Service`
- **Return type:** Luôn trả `Promise<Result<T>>`. **Không bao giờ throw exception** tại Service — thay vào đó `return Err(...)`.
- **Dependency injection:** Nhận Repository qua constructor. Nhận Redis/cơ chế phụ trợ qua Mechanic hoặc Infrastructure Service.
- **Transaction scope:** Khi cần multi-table atomicity, nhận `DrizzleClient` từ `DatabaseModule` và thực thi trong `db.transaction(async (tx) => {...})`.

```typescript
// Template: src/modules/{module}/services/{resource}.service.ts
import { Injectable } from '@nestjs/common';
import { {Resource}Repository } from '../repositories/{resource}.repository';
import { Result } from '@shared/response/result';
import { AppError } from '@shared/response/errors';
import { Create{Resource}Dto } from '../dto/create-{resource}.dto';
import { {Resource}ResponseDto } from '../dto/{resource}-response.dto';

@Injectable()
export class {Resource}Service {
  constructor(private readonly {resource}Repo: {Resource}Repository) {}

  async create(dto: Create{Resource}Dto): Promise<Result<{Resource}ResponseDto>> {
    // 1. Business rule validation
    const exists = await this.{resource}Repo.findByXxx(dto.xxx);
    if (exists) {
      return Err({
        category: 'CONFLICT',
        code: '{RESOURCE}_DUPLICATE',
        message: 'Resource already exists',
      } satisfies AppError);
    }

    // 2. Persistence
    const created = await this.{resource}Repo.create(dto);

    // 3. Map to response DTO and return Ok
    return Result.ok({Resource}ResponseDto.from(created));
  }
}
```

---

### 1.3 Repository Convention

**Quy tắc:**

- **File naming:** `{resource}.repository.ts`
- **Class naming:** `{Resource}Repository`
- **Dependency:** Inject `DATABASE_CONNECTION` (Drizzle client) và `DATABASE_SCHEMA` từ `DatabaseModule` thông qua token constants.
- **Trách nhiệm:** Repository **chỉ nói chuyện với database**. Không chứa business rule. Trả về domain type (từ `database/types/`), không trả ORM entity thô.
- **Naming convention cho method:** `findById`, `findByXxx`, `findMany`, `create`, `update`, `delete`, `upsert`.
- **Locking:** Method yêu cầu Pessimistic Lock nhận `tx` (transaction client) làm tham số tùy chọn.

```typescript
// Template: src/modules/{module}/repositories/{resource}.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION, DATABASE_SCHEMA, type DatabaseClient, type DatabaseSchema } from '@database';
import { eq } from 'drizzle-orm';
import type { {Resource} } from '@database/types';

@Injectable()
export class {Resource}Repository {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseClient,
    @Inject(DATABASE_SCHEMA) private readonly schema: DatabaseSchema,
  ) {}

  async findById(id: string): Promise<{Resource} | null> {
    const [row] = await this.db
      .select()
      .from(this.schema.{resources})
      .where(eq(this.schema.{resources}.{resource}Id, id))
      .limit(1);
    return row ?? null;
  }

  async create(data: New{Resource}): Promise<{Resource}> {
    const [created] = await this.db
      .insert(this.schema.{resources})
      .values(data)
      .returning();
    return created;
  }
  
  // Variant với transaction client (Pessimistic Lock)
  async findByIdForUpdate(id: string, tx: DatabaseClient): Promise<{Resource} | null> {
    const [row] = await tx
      .select()
      .from(this.schema.{resources})
      .where(eq(this.schema.{resources}.{resource}Id, id))
      .for('update') // SELECT ... FOR UPDATE
      .limit(1);
    return row ?? null;
  }
}
```

---

### 1.4 DTO Convention

**Quy tắc:**

- **File naming:** `{action}-{resource}.dto.ts` cho request DTO; `{resource}-response.dto.ts` cho response DTO.
- **Validation:** Sử dụng **Zod** cho schema validation (`ZodValidationPipe` đã được cấu hình globally).
- **Response DTO:** Dùng static factory method `from()` để map từ DB entity sang response shape — tránh lộ cột nội bộ (password_hash, raw_gateway_response...).
- **Phân tách rõ ràng:** Request DTO và Response DTO là hai class/object **tách biệt**, không dùng chung.

```typescript
// Template request: src/modules/{module}/dto/create-{resource}.dto.ts
import { z } from 'zod';

export const Create{Resource}Schema = z.object({
  title: z.string().min(1).max(500),
  // ... other fields
});

export type Create{Resource}Dto = z.infer<typeof Create{Resource}Schema>;

// Template response: src/modules/{module}/dto/{resource}-response.dto.ts
import type { {Resource} } from '@database/types';

export class {Resource}ResponseDto {
  {resource}Id: string;
  title: string;
  // ... safe fields only (no password_hash, no internal keys)

  static from(entity: {Resource}): {Resource}ResponseDto {
    return {
      {resource}Id: entity.{resource}Id,
      title: entity.title,
      // map fields explicitly
    };
  }
}
```

---

## 2. Core Guards & Decorators

### 2.1 Guards (`src/core/guards/`)

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `jwt-auth.guard.ts` | `JwtAuthGuard` | Guard (Global default) | Middleware xác thực chính. Giải mã JWT từ `Authorization: Bearer` header, kiểm tra chữ ký và `exp`. Tra cứu `jti` trong Redis Blacklist (`token:blacklist:{jti}`) — nếu tồn tại trả `401 TOKEN_REVOKED`. Bỏ qua (skip) nếu route được đánh dấu `@Public()`. Gắn `JwtPayload` vào `request.user` để các component sau sử dụng. |
| `roles.guard.ts` | `RolesGuard` | Guard | Phân quyền RBAC theo role. Đọc metadata `roles` được set bởi `@Roles()` decorator. So sánh với `request.user.role` từ JWT payload. Trả `403 FORBIDDEN` nếu không khớp. Phụ thuộc vào `JwtAuthGuard` chạy trước. |
| `workshop-scope.guard.ts` | `WorkshopScopeGuard` | Guard (Route-level) | Kiểm soát phạm vi của `CHECKIN_STAFF`. Đọc `workshop_id` từ route param hoặc request body, so sánh với mảng `allowed_workshop_ids` trong JWT payload. Trả `403 CHECKIN_SCOPE_DENIED` nếu workshop không nằm trong danh sách được phân công. Chỉ áp dụng cho routes trong module `checkin`. |
| `hmac-signature.guard.ts` | `HmacSignatureGuard` | Guard (Route-level) | Xác thực webhook từ Payment Gateway thay cho JWT. Đọc `X-Gateway-Signature` header, tính HMAC-SHA256 từ request body và so sánh với shared secret của từng gateway. Trả `401` nếu chữ ký không hợp lệ. Áp dụng **duy nhất** cho `POST /webhooks/payment/{gateway}`. |

### 2.2 Decorators (`src/shared/decorators/`)

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `roles.decorator.ts` | `@Roles(...roles)` | Custom Decorator | SetMetadata decorator gắn danh sách role vào route handler metadata. `RolesGuard` đọc metadata này để kiểm tra quyền. Dùng `UserRole` enum từ `@database/types`. |
| `public.decorator.ts` | `@Public()` | Custom Decorator | SetMetadata decorator đánh dấu một route là PUBLIC (không cần JWT). `JwtAuthGuard` đọc metadata `IS_PUBLIC_KEY` để skip xác thực. Dùng cho: `POST /auth/login`, `POST /auth/refresh`, `GET /workshops`, `GET /workshops/{id}`. |
| `current-user.decorator.ts` | `@CurrentUser()` | Param Decorator | `createParamDecorator` trích xuất `request.user` (JwtPayload đã được gắn bởi `JwtAuthGuard`). Dùng trong controller để lấy `user_id`, `role`, `allowed_workshop_ids` mà không cần inject request object trực tiếp. |
| `idempotency-key.decorator.ts` | `@IdempotencyKey()` | Param Decorator | `createParamDecorator` trích xuất `X-Idempotency-Key` header. Dùng trong `PaymentsController` để nhận idempotency key từ client. Throw `400 VALIDATION_FAILED` nếu header vắng mặt tại route yêu cầu. |

---

## 3. Shared Infrastructure

### 3.1 Redis Module (`src/shared/` hoặc `src/infrastructure/`)

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `redis/redis.module.ts` | `RedisModule` | NestJS Module (Global) | Global module cung cấp `RedisService` thông qua `ioredis`. Đọc `REDIS_URL` từ config. Export `RedisService` để tất cả module dùng không cần import lại. |
| `redis/redis.service.ts` | `RedisService` | Service (Infrastructure) | Wrapper trên `ioredis` client. Expose các primitive cần thiết: `get`, `set`, `setNx`, `del`, `incr`, `decr`, `expire`, `hGet`, `hSet`, `hGetAll`, `ttl`. Xử lý serialization/deserialization JSON. Đây là layer duy nhất tương tác trực tiếp với Redis — các Mechanic/Service sử dụng `RedisService`, không dùng ioredis trực tiếp. |

### 3.2 Response Shared (`src/shared/response/`) — Đã có

| File | Component | Loại | Ghi chú |
|---|---|---|---|
| `result.ts` | `Result<T,E>`, `Ok()`, `Err()`, `isOk()`, `isErr()` | Type utilities | Đã triển khai — Railway Oriented Programming pattern |
| `errors.ts` | `AppError`, `ErrorCode`, `ErrorCategory` | Error types | Đã triển khai |
| `types.ts` | `ApiResponse<T>`, `PaginationMeta`, `RequestMeta` | Response envelope types | Đã triển khai |
| `builder.ts` | `successResponse()`, `errorResponse()` | Builder functions | Đã triển khai — dùng trong `ResponseInterceptor` và `GlobalExceptionFilter` |

---

## 4. Module IAM (`src/modules/iam/`)

**Module file:** `iam.module.ts`
Exports: `AuthService`, `TokenService` (dùng bởi `JwtAuthGuard` ở Core)

### 4.1 Controllers

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `controllers/auth.controller.ts` | `AuthController` | Controller | Xử lý `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`. Login và refresh là `@Public()`. Logout và /me yêu cầu JWT hợp lệ (`@UseGuards(JwtAuthGuard)` không cần RolesGuard — role `ANY`). |
| `controllers/users-admin.controller.ts` | `UsersAdminController` | Controller | Xử lý `GET /admin/users`, `GET /admin/users/{id}`, `PATCH /admin/users/{id}/status`, `POST /admin/users/{id}/revoke-token`. Toàn bộ yêu cầu role `ORGANIZER`. |
| `controllers/checkin-staff-admin.controller.ts` | `CheckinStaffAdminController` | Controller | Xử lý `POST /admin/checkin-staff/{user_id}/assign-workshops`, `GET /admin/checkin-staff/{user_id}/workshops`. Role `ORGANIZER`. Kết hợp với warning về Eventual Consistency trong response. |

### 4.2 Services

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `services/auth.service.ts` | `AuthService` | Service | Orchestrate luồng đăng nhập: xác thực credential với bcrypt, sinh Dual-Token, xử lý platform-specific expiry (WEB: 15 phút / MOBILE: 8 giờ cho Access Token). Gọi `TokenService` để sinh token và `UsersRepository` để lấy user. Trả `INVALID_CREDENTIALS` chung (không tiết lộ field sai). |
| `services/token.service.ts` | `TokenService` | Service | Toàn bộ lifecycle của JWT: `signAccessToken(payload, platform)`, `signRefreshToken()`, `verifyAccessToken(token)`, `verifyRefreshToken(token)`, `blacklistToken(jti, remainingTtl)`, `isBlacklisted(jti)`. Sử dụng `RedisService` để lưu/tra cứu Blacklist (`token:blacklist:{jti}`). Sử dụng `jsonwebtoken` hoặc `@nestjs/jwt`. |
| `services/users.service.ts` | `UsersService` | Service | Các thao tác quản lý người dùng dành cho Admin: `listUsers(role?)`, `getUserById(id)`, `updateUserStatus(id, status)`. Khi SUSPENDED, tự động gọi `TokenService.blacklistToken()`. |
| `services/student-profile.service.ts` | `StudentProfileService` | Service | Truy xuất hồ sơ sinh viên: `getProfileByUserId(userId)` — dùng để compose response cho `GET /auth/me` khi role là `STUDENT`. |
| `services/checkin-staff-assignment.service.ts` | `CheckinStaffAssignmentService` | Service | Quản lý phân công workshop cho nhân sự: `assignWorkshops(userId, workshopIds)`, `getAssignedWorkshops(userId)`. Lưu vào bảng assignment trong DB. Đính kèm Eventual Consistency warning trong result. |

### 4.3 Repositories

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `repositories/users.repository.ts` | `UsersRepository` | Repository | CRUD trên bảng `users`. Method chính: `findById`, `findByEmail`, `updateStatus`. Dùng `findByEmail` cho login flow (có index `idx_users_email`). |
| `repositories/students.repository.ts` | `StudentsRepository` | Repository | Truy xuất profile sinh viên từ bảng `students`. Method: `findByUserId`, `findByStudentCode`. Hỗ trợ JOIN với `users` để compose `AuthMe` response. |
| `repositories/checkin-staff-assignments.repository.ts` | `CheckinStaffAssignmentsRepository` | Repository | Quản lý bảng mapping `checkin_staff_assignments` (bảng phụ cần tạo, không có trong schema ban đầu — lưu `user_id` và `workshop_ids[]` dạng JSON hoặc bảng liên kết). Method: `findByUserId`, `upsert`. |

### 4.4 DTOs

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `dto/login.dto.ts` | `LoginSchema` / `LoginDto` | Request DTO (Zod) | Validate `{ email, password, platform: 'WEB' \| 'MOBILE' }`. |
| `dto/login-response.dto.ts` | `LoginResponseDto` | Response DTO | Shape: `{ access_token, refresh_token?, expires_in, user: AuthMeDto }`. Factory `from()` map từ token pair + user entity. |
| `dto/refresh-token.dto.ts` | `RefreshTokenSchema` / `RefreshTokenDto` | Request DTO (Zod) | Body tùy chọn `{ refresh_token? }` (required khi MOBILE). |
| `dto/auth-me-response.dto.ts` | `AuthMeResponseDto` | Response DTO | Shape: `{ user_id, email, role, student_code?, full_name?, faculty?, allowed_workshop_ids? }`. Factory `from(user, studentProfile?)` map đúng fields theo role. |
| `dto/update-user-status.dto.ts` | `UpdateUserStatusSchema` / `UpdateUserStatusDto` | Request DTO (Zod) | Validate `{ status: 'ACTIVE' \| 'SUSPENDED' }`. |
| `dto/assign-workshops.dto.ts` | `AssignWorkshopsSchema` / `AssignWorkshopsDto` | Request DTO (Zod) | Validate `{ workshop_ids: z.array(z.string().uuid()) }`. |
| `dto/user-response.dto.ts` | `UserResponseDto` | Response DTO | Shape: `{ user_id, email, role, status, created_at }`. Factory `from(user)` — loại bỏ `password_hash`. |

---

## 5. Module Catalog (`src/modules/catalog/`)

**Module file:** `catalog.module.ts`
Imports: `DatabaseModule`, `RedisModule`. Export: `WorkshopsService` (dùng bởi `BookingModule` và `CheckinModule`).

### 5.1 Controllers

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `controllers/workshops-public.controller.ts` | `WorkshopsPublicController` | Controller | Xử lý `GET /workshops` và `GET /workshops/{workshop_id}`. Cả hai endpoint đều `@Public()`. Truy vấn `available_seats` từ Redis (`seat:available:{workshop_id}`), không truy vấn PostgreSQL để lấy số ghế real-time. |
| `controllers/workshops-admin.controller.ts` | `WorkshopsAdminController` | Controller | Xử lý toàn bộ admin workshop endpoints: `GET/POST /admin/workshops`, `GET/PUT /admin/workshops/{id}`, `POST .../publish`, `PATCH .../emergency-update`, `POST .../cancel`, `GET .../stats`. Role `ORGANIZER`. |
| `controllers/rooms-admin.controller.ts` | `RoomsAdminController` | Controller | Xử lý `GET /admin/rooms` và `POST /admin/rooms`. Role `ORGANIZER`. |
| `controllers/speakers-admin.controller.ts` | `SpeakersAdminController` | Controller | Xử lý `GET /admin/speakers` và `POST /admin/speakers`. Role `ORGANIZER`. |
| `controllers/documents-admin.controller.ts` | `DocumentsAdminController` | Controller | Xử lý upload PDF (`POST /admin/workshops/{id}/documents`), list (`GET .../documents`), delete (`DELETE /admin/documents/{id}`), AI summary status (`GET .../summary`), retry (`POST .../ai-retry`). Role `ORGANIZER`. Dùng `FileInterceptor` của NestJS cho multipart upload. |

### 5.2 Services

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `services/workshops.service.ts` | `WorkshopsService` | Service | Logic cốt lõi của catalog: `listPublished(query)`, `getPublicDetail(id)`, `createWorkshop(dto, userId)`, `updateWorkshop(id, dto)`, `publishWorkshop(id)` (khởi tạo Redis counter `SET seat:available:{id} {capacity}`), `emergencyUpdate(id, dto)` (kiểm tra conflict phòng rồi đẩy event), `cancelWorkshop(id)` (cascade void tickets, DEL Redis counter), `getAdminDetail(id)`, `listAdmin(query)`, `getStats(id)`. |
| `services/room-conflict.service.ts` | `RoomConflictService` | Service | Chuyên kiểm tra xung đột phòng: `checkConflict(roomId, startsAt, endsAt, excludeWorkshopId?)`. Query bảng `workshops` WHERE `room_id = ? AND status = 'PUBLISHED' AND ranges overlap`. Trả `WORKSHOP_TIME_CONFLICT` nếu bị trùng. Được `WorkshopsService` gọi khi tạo/cập nhật/emergency-update. |
| `services/rooms.service.ts` | `RoomsService` | Service | `listRooms()`, `createRoom(dto)`. |
| `services/speakers.service.ts` | `SpeakersService` | Service | `listSpeakers()`, `createSpeaker(dto)`. |
| `services/documents.service.ts` | `DocumentsService` | Service | `uploadDocument(workshopId, file, uploadedBy)` — lưu file lên Object Storage, lưu URL vào DB, **tự động đẩy AI Summary job vào queue**. `deleteDocument(id)` — xóa DB record và file trên Object Storage. `getAiSummaryStatus(documentId)`. `retryAiSummary(documentId)` — chỉ cho phép khi status `FAILED`. |
| `services/seat-counter.service.ts` | `SeatCounterService` | Service | Quản lý Redis counter cho available seats: `initialize(workshopId, capacity)` (dùng khi publish), `getAvailable(workshopId)` (đọc từ Redis, fallback PostgreSQL), `delete(workshopId)` (dùng khi cancel). Tách riêng để `BookingModule` import dùng cho `DECR`. |

### 5.3 Repositories

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `repositories/workshops.repository.ts` | `WorkshopsRepository` | Repository | CRUD + queries trên bảng `workshops`. Method nổi bật: `findPublished(filters)`, `findById(id)`, `findByIdAndStatus(id, status)`, `create(data)`, `update(id, data)`, `updateStatus(id, status)`. Index được sử dụng: `idx_workshops_status`, `idx_workshops_starts_at`. |
| `repositories/workshop-slots.repository.ts` | `WorkshopSlotsRepository` | Repository | Quản lý bảng `workshop_slots`. Method: `findByWorkshopId`, `create(workshopId, capacity)`, `incrementConfirmed(workshopId, tx)`, `decrementConfirmed(workshopId, tx)`, `reconcile(workshopId, lockedCount, confirmedCount)`. Tất cả write operations nhận `tx` để đảm bảo atomicity với `registrations`. |
| `repositories/rooms.repository.ts` | `RoomsRepository` | Repository | `findAll()`, `findById(id)`, `create(data)`, `findConflicting(roomId, startsAt, endsAt)` — Query trực tiếp dùng partial unique index `uq_workshops_room_time_slot`. |
| `repositories/speakers.repository.ts` | `SpeakersRepository` | Repository | `findAll()`, `findById(id)`, `create(data)`. |
| `repositories/workshop-documents.repository.ts` | `WorkshopDocumentsRepository` | Repository | `findByWorkshopId(id)`, `findById(id)`, `create(data)`, `updateStatus(id, status)`, `delete(id)`. |
| `repositories/ai-summaries.repository.ts` | `AiSummariesRepository` | Repository | `findByDocumentId(id)`, `upsert(documentId, workshopId, data)` — dùng ON CONFLICT DO UPDATE vì 1 document → 1 summary. `updateStatus(id, status, summaryText?)`. |

### 5.4 DTOs

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `dto/create-workshop.dto.ts` | `CreateWorkshopSchema` / `CreateWorkshopDto` | Request DTO (Zod) | Validate `{ title, description?, speaker_id, room_id, starts_at, ends_at, capacity, is_paid, price? }`. Refinement: nếu `is_paid = true` thì `price` bắt buộc > 0. |
| `dto/update-workshop.dto.ts` | `UpdateWorkshopSchema` / `UpdateWorkshopDto` | Request DTO (Zod) | Tất cả fields optional (partial update). Chỉ áp dụng khi `status = DRAFT`. Refinement tương tự `CreateWorkshopDto` cho `is_paid/price`. |
| `dto/emergency-update-workshop.dto.ts` | `EmergencyUpdateWorkshopSchema` / `EmergencyUpdateWorkshopDto` | Request DTO (Zod) | Validate `{ room_id?, starts_at?, ends_at? }`. Ít nhất một field phải có. |
| `dto/list-workshops-query.dto.ts` | `ListWorkshopsQuerySchema` / `ListWorkshopsQueryDto` | Query DTO (Zod) | Validate query params: `{ faculty?, date_from?, date_to?, is_paid?, page?, limit? }`. |
| `dto/create-room.dto.ts` | `CreateRoomSchema` / `CreateRoomDto` | Request DTO (Zod) | Validate `{ name, building?, floor?, capacity, floor_plan_url?, facilities? }`. |
| `dto/create-speaker.dto.ts` | `CreateSpeakerSchema` / `CreateSpeakerDto` | Request DTO (Zod) | Validate `{ full_name, title?, bio?, avatar_url? }`. |
| `dto/workshop-response.dto.ts` | `WorkshopSummaryDto`, `WorkshopDetailDto`, `WorkshopAdminDetailDto` | Response DTO | Ba shape cho ba ngữ cảnh (public list, public detail, admin detail). `WorkshopAdminDetailDto` thêm `confirmed_count`, `locked_count`, `created_by`. Mỗi class có static `from()`. |
| `dto/room-response.dto.ts` | `RoomResponseDto` | Response DTO | Shape đầy đủ của Room entity. |
| `dto/speaker-response.dto.ts` | `SpeakerResponseDto` | Response DTO | Shape đầy đủ của Speaker entity. |
| `dto/document-response.dto.ts` | `WorkshopDocumentResponseDto` | Response DTO | Shape: `{ document_id, workshop_id, file_url, original_name, file_size_bytes, upload_status, uploaded_at }`. |
| `dto/ai-summary-response.dto.ts` | `AiSummaryPublicDto`, `AiSummaryAdminDto` | Response DTO | `Public` chỉ có `status`, `summary_text`, `model_used`, `generated_at`. `Admin` thêm `summary_id`, `document_id`, `error_message`. |

---

## 6. Module Booking (`src/modules/booking/`)

**Module file:** `booking.module.ts`
Imports: `DatabaseModule`, `RedisModule`, `CatalogModule` (để dùng `SeatCounterService`).
Đây là module quan trọng nhất, chứa critical path 12.000 CCU.

### 6.1 Controllers

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `controllers/registrations.controller.ts` | `RegistrationsController` | Controller | Xử lý `POST /registrations` (STUDENT — critical path), `DELETE /registrations/{id}` (STUDENT — IDOR protected), `GET /students/me/registrations` (STUDENT), `GET /students/me/registrations/{id}` (STUDENT). IDOR: tất cả student endpoints dùng `@CurrentUser()` thay vì path param để inject `student_id`. |
| `controllers/payments.controller.ts` | `PaymentsController` | Controller | Xử lý `POST /payments` (STUDENT — yêu cầu `@IdempotencyKey()` decorator), `POST /webhooks/payment/{gateway}` (PUBLIC + `HmacSignatureGuard`), `GET /students/me/payments` (STUDENT), `GET /students/me/payments/{id}` (STUDENT). |

### 6.2 Services

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `services/registrations.service.ts` | `RegistrationsService` | Service | Orchestrate luồng đăng ký theo thứ tự bắt buộc: (1) Rate Limit check, (2) Redis DECR, (3) DB UNIQUE check, (4a/4b) insert. Gọi `RateLimiterMechanic`, `SeatCounterService`, `RegistrationsRepository`. Xử lý cả workshop miễn phí (confirm ngay + issue ticket) và có phí (pending + seat lock). |
| `services/payments.service.ts` | `PaymentsService` | Service | Orchestrate luồng thanh toán: (1) SeatLock TTL check, (2) Idempotency Layer 1, (3) Circuit Breaker check, (4) INSERT payments với Pessimistic Lock (Lock Wait Timeout 3s), (5) Gọi Payment Gateway adapter. Xử lý webhook callback (`handleWebhookSuccess`, `handleWebhookFailure`) trong ACID transaction. |
| `services/payment-gateway.service.ts` | `PaymentGatewayService` | Service | Adapter layer cho các cổng thanh toán (VNPAY, MOMO, STRIPE, MOCK). Interface chung: `initiatePayment(gateway, amount, metadata)`, `verifyHmacSignature(gateway, payload, signature)`. Mỗi gateway implement riêng phía sau adapter. |

### 6.3 Mechanics (`src/modules/booking/mechanics/`)

> **Lưu ý thiết kế:** Thư mục `mechanics/` chứa các component có trách nhiệm đơn lẻ xử lý tương tác với Redis cho các bài toán kỹ thuật phức tạp. Được inject vào Services, không vào Controllers.

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `mechanics/rate-limiter.mechanic.ts` | `RateLimiterMechanic` | Mechanic (Service) | Token Bucket per user. `consumeToken(userId)`: đọc Hash `ratelimit:register:{user_id}`, kiểm tra `tokens > 0`, decrement. Nếu key chưa tồn tại: init bucket với `capacity=5`, `last_refill_at=now`. Tính token refill dựa trên thời gian đã trôi qua (1 token/10 giây). TTL 300s cho key. Trả `RATE_LIMIT_EXCEEDED` nếu bucket rỗng. |
| `mechanics/seat-lock.mechanic.ts` | `SeatLockMechanic` | Mechanic (Service) | Quản lý Redis `seat:lock:{workshopId}:{registrationId}`. `acquire(workshopId, registrationId, studentId, amount)`: SET NX EX 900 với JSON payload. `release(workshopId, registrationId)`: DEL key. `check(workshopId, registrationId)`: kiểm tra TTL còn không. Trả `SEAT_LOCK_EXPIRED` nếu TTL = 0 hoặc key không tồn tại. |
| `mechanics/idempotency.mechanic.ts` | `IdempotencyMechanic` | Mechanic (Service) | Layer 1 chống double-charge. `check(idempotencyKey)`: SET NX `idempotency:{key}` EX 86400. Nếu key đã tồn tại (SET NX trả về null) → GET `idempotency:{key}` để lấy `payment_id` cũ → trả `PAYMENT_DUPLICATE` kèm `payment_id` cũ. Nếu chưa tồn tại: set key với giá trị placeholder, trả về `proceed: true`. Sau khi tạo payment thành công: `setPaymentId(key, paymentId)` update giá trị. |
| `mechanics/circuit-breaker.mechanic.ts` | `CircuitBreakerMechanic` | Mechanic (Service) | Quản lý Redis Hash `circuit:payment:{gateway}`. `checkAndAllow(gateway)`: đọc `state` — nếu `OPEN` kiểm tra `opened_at + 30s` để chuyển `HALF_OPEN`, nếu vẫn `OPEN` → trả `PAYMENT_GATEWAY_OPEN`. `recordSuccess(gateway)`: nếu `HALF_OPEN` → chuyển `CLOSED`, reset `failure_count`. `recordFailure(gateway)`: tăng `failure_count`, nếu >= 5 trong 60s → chuyển `OPEN`, set `opened_at`. |
| `mechanics/global-rate-limit.mechanic.ts` | `GlobalRateLimitMechanic` | Mechanic (Service) | Rate limit toàn hệ thống (không phải per-user). `check()`: INCR `ratelimit:global:register` + EXPIRE 1s. Nếu counter > 500 → trả `429`. Sliding window đơn giản. Chạy **trước** Token Bucket per-user trong luồng đăng ký. |

### 6.4 Repositories

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `repositories/registrations.repository.ts` | `RegistrationsRepository` | Repository | CRUD trên bảng `registrations`. Method nổi bật: `findByStudentAndWorkshop(studentId, workshopId)` — kiểm tra UNIQUE constraint, `create(data, tx?)`, `updateStatus(id, status, tx?)`, `findMyRegistrations(studentId, statusFilter?, pagination)`, `cancelAllForWorkshop(workshopId, tx)` — dùng khi cancel workshop. |
| `repositories/payments.repository.ts` | `PaymentsRepository` | Repository | CRUD trên bảng `payments`. Method nổi bật: `findByIdempotencyKey(key)` — kiểm tra Layer 2 idempotency (UNIQUE constraint), `create(data, tx?)`, `updateStatus(id, status, gatewayTxnId?, tx?)`, `findMyPayments(studentId, pagination)`, `findPendingOverdue()` — cho payment timeout cron. |

### 6.5 DTOs

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `dto/create-registration.dto.ts` | `CreateRegistrationSchema` / `CreateRegistrationDto` | Request DTO (Zod) | Validate `{ workshop_id: z.string().uuid() }`. |
| `dto/create-payment.dto.ts` | `CreatePaymentSchema` / `CreatePaymentDto` | Request DTO (Zod) | Validate `{ registration_id, gateway: PaymentGateway }`. Header `X-Idempotency-Key` được extract bởi `@IdempotencyKey()` decorator riêng. |
| `dto/payment-webhook.dto.ts` | `PaymentWebhookSchema` / `PaymentWebhookDto` | Request DTO (Zod) | Validate webhook payload: `{ gateway_txn_id, status: 'SUCCESS' \| 'FAILED', idempotency_key, raw_response? }`. |
| `dto/registration-response.dto.ts` | `RegistrationDto`, `RegistrationWithDetailsDto` | Response DTO | `RegistrationDto`: fields cơ bản + `payment_deadline?` + `amount?`. `RegistrationWithDetailsDto`: extends với `workshop: WorkshopSummaryDto`, `ticket?: TicketDto`, `payment?: PaymentDto`. |
| `dto/payment-response.dto.ts` | `PaymentResponseDto`, `CreatePaymentResponseDto` | Response DTO | `PaymentResponseDto`: full payment entity (loại bỏ `raw_gateway_response`). `CreatePaymentResponseDto`: `{ payment_id, redirect_url, payment_deadline }`. |

---

## 7. Module Check-in (`src/modules/checkin/`)

**Module file:** `checkin.module.ts`
Imports: `DatabaseModule`, `RedisModule`, `CatalogModule`. Imports `BookingModule` (để access `RegistrationsRepository` qua service).

### 7.1 Controllers

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `controllers/checkin.controller.ts` | `CheckinController` | Controller | Xử lý toàn bộ check-in endpoints: `GET /checkin/workshops/{id}/tickets`, `POST /checkin/scan`, `POST /checkin/sync`, `GET /checkin/workshops/{id}/status`. Tất cả yêu cầu role `CHECKIN_STAFF`. `GET .../tickets` và `POST /checkin/scan` còn yêu cầu `@UseGuards(WorkshopScopeGuard)`. |
| `controllers/tickets.controller.ts` | `TicketsController` | Controller | Xử lý `GET /students/me/tickets` và `GET /students/me/tickets/{id}`. Role `STUDENT`. IDOR protected bằng `@CurrentUser()`. |

### 7.2 Services

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `services/checkin.service.ts` | `CheckinService` | Service | `scanQR(qrToken, workshopId, staffUserId, deviceId)`: lookup ticket bằng `idx_tickets_qr_token`, kiểm tra status, tạo `checkin_records` với `source = ONLINE`. Trả `TICKET_VOID` hoặc `TICKET_ALREADY_CHECKEDIN` theo trường hợp. `getWorkshopCheckinStatus(workshopId)`: truy vấn thống kê + danh sách 20 check-in gần nhất. |
| `services/ticket.service.ts` | `TicketService` | Service | `issueTicket(registrationId)`: sinh `qr_token` (JWT signed hoặc UUID signed), insert bảng `tickets`. Chỉ được gọi sau khi Registration chuyển `CONFIRMED`. `voidTicket(registrationId, tx?)`: cập nhật `status = VOID`, set `voided_at`. `getMyTickets(studentId)`: trả Tickets `ACTIVE` kèm Workshop info. `preloadActiveTickets(workshopId)`: trả toàn bộ `ACTIVE` tickets của workshop cho Mobile App. |
| `services/offline-sync.service.ts` | `OfflineSyncService` | Service | `processSyncBatch(items[], staffUserId)`: với mỗi item, giải mã `qr_token` để lấy `ticket_id`, thực thi `INSERT INTO checkin_records ON CONFLICT (ticket_id, workshop_id) DO NOTHING`. Phân loại kết quả thành `synced`, `skipped`, `conflicts` (ticket VOID). Trả `SyncResultDto`. |

### 7.3 Repositories

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `repositories/tickets.repository.ts` | `TicketsRepository` | Repository | `findByRegistrationId(id)`, `findByQrToken(qrToken)` — hot query, dùng `idx_tickets_qr_token`. `create(data, tx?)`, `voidById(id, tx?)`, `findActiveByStudentId(studentId)`, `findActiveByWorkshopId(workshopId)`. |
| `repositories/checkin-records.repository.ts` | `CheckinRecordsRepository` | Repository | `create(data)`, `createBatchIdempotent(items[])` — wraps `INSERT ... ON CONFLICT DO NOTHING`. `findByWorkshopId(workshopId, limit?)`, `countByWorkshopId(workshopId)`, `existsByTicketAndWorkshop(ticketId, workshopId)`. |

### 7.4 DTOs

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `dto/scan-qr.dto.ts` | `ScanQrSchema` / `ScanQrDto` | Request DTO (Zod) | Validate `{ qr_token: z.string(), workshop_id: z.string().uuid() }`. |
| `dto/sync-offline.dto.ts` | `OfflineCheckinItemSchema`, `OfflineCheckinItemDto`, `SyncOfflineResponseDto` | Request + Response DTO | Request: array của `{ local_id, qr_token, workshop_id, checked_in_at, device_id, checked_in_by }`. Response: `{ synced: number, skipped: number, conflicts: SyncConflictDto[] }`. |
| `dto/ticket-response.dto.ts` | `TicketDto`, `TicketWithWorkshopDto` | Response DTO | `TicketDto`: fields cơ bản. `TicketWithWorkshopDto`: extends với `workshop: { workshop_id, title, starts_at, room: { name, building } }`. |
| `dto/checkin-status-response.dto.ts` | `CheckinStatusResponseDto` | Response DTO | Shape: `{ total_registered, total_checkedin, remaining, recent_checkins: RecentCheckinItem[] }`. |
| `dto/preload-tickets-response.dto.ts` | `PreloadTicketItemDto` | Response DTO | Shape: `{ ticket_id, qr_token, student_name, student_code }` — chỉ fields cần thiết để giảm payload cho Mobile. |

---

## 8. Module Background (`src/modules/background/`)

**Module file:** `background.module.ts`
Imports: `DatabaseModule`, `RedisModule`. Module này xử lý tất cả async/scheduled tasks.

### 8.1 Controllers

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `controllers/notifications-admin.controller.ts` | `NotificationsAdminController` | Controller | Xử lý `GET /admin/notifications/logs`, `GET /admin/notifications/logs/{id}`, `GET /admin/notifications/channels`, `PATCH /admin/notifications/channels/{channel_type}`. Role `ORGANIZER`. |
| `controllers/student-sync-admin.controller.ts` | `StudentSyncAdminController` | Controller | Xử lý `POST /admin/student-sync` (trả `202 Accepted` ngay, không block), `GET /admin/student-sync`, `GET /admin/student-sync/{job_id}`, `GET /admin/student-sync/{job_id}/errors`. Role `ORGANIZER`. |
| `controllers/system-admin.controller.ts` | `SystemAdminController` | Controller | Xử lý `GET /admin/system/jobs/payment-timeout`, `GET /admin/system/jobs/reconciliation`, `GET /admin/system/circuit-breaker`, `POST /admin/system/circuit-breaker/{gateway}/reset`. Role `ORGANIZER`. |

### 8.2 Services

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `services/notifications.service.ts` | `NotificationsService` | Service | Quản lý audit trail và cấu hình kênh: `listLogs(filters, pagination)`, `getLogById(id)`, `listChannelConfigs()`, `updateChannelConfig(channelType, dto)`. Không xử lý việc gửi thực tế — đó là `NotificationWorker`. |
| `services/notification-dispatch.service.ts` | `NotificationDispatchService` | Service | Thực thi gửi thông báo theo từng kênh. `dispatch(notificationId)`: load config từ `notification_channel_configs`, gọi provider tương ứng (Email SMTP, Telegram Bot API). Ghi nhật ký kết quả vào `notification_logs`. Được `NotificationWorker` gọi. |
| `services/ai-summary.service.ts` | `AiSummaryService` | Service | Xử lý AI Summary pipeline (Pipe-and-Filter): `processDocument(documentId)` → (1) Extract text từ PDF, (2) Clean & normalize, (3) Gọi LLM (`claude-sonnet-4-20250514`), (4) Lưu `summary_text`. Update status qua `AiSummariesRepository`. Được `AiSummaryWorker` gọi. |
| `services/student-sync.service.ts` | `StudentSyncService` | Service | `triggerSync(sourceFileName)`: tạo job RUNNING, trả `job_id`. `processJob(jobId)`: đọc CSV từ Object Storage, parse, upsert từng dòng vào `students` theo `student_code` (Batch-Sequential). Ghi lỗi vào `student_sync_errors`. `getJob(jobId)`, `getJobErrors(jobId, pagination)`. |
| `services/system-monitor.service.ts` | `SystemMonitorService` | Service | `getPaymentTimeoutJobStatus()`: đếm `payments WHERE status='PENDING' AND timeout_at < NOW()`, đọc last_run metadata. `getReconciliationJobStatus()`: so sánh Redis counter với `workshop_slots.confirmed_count + locked_count`. `getCircuitBreakerStatus()`: đọc tất cả `circuit:payment:*` từ Redis. `resetCircuitBreaker(gateway)`: force set `state=CLOSED`, `failure_count=0`. |

### 8.3 Workers (`src/modules/background/workers/`)

> Workers là các handler lắng nghe Message Queue (hoặc job queue). Nếu dùng Bull/BullMQ, đây là `@Processor()`. Nếu chưa setup MQ, có thể implement là `EventEmitter2` listener trong giai đoạn đầu.

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `workers/notification.worker.ts` | `NotificationWorker` | Worker (Queue Consumer) | Lắng nghe queue `notification`. Khi nhận event (REGISTRATION_CONFIRMED, PAYMENT_SUCCESS, WORKSHOP_CANCELLED...), gọi `NotificationDispatchService.dispatch()`. Xử lý retry khi gửi thất bại. Update `notification_logs.status` sau mỗi attempt. |
| `workers/ai-summary.worker.ts` | `AiSummaryWorker` | Worker (Queue Consumer) | Lắng nghe queue `ai-summary`. Khi nhận `documentId`, gọi `AiSummaryService.processDocument()`. Xử lý timeout LLM, cập nhật `ai_summaries.status = FAILED` kèm `error_message` nếu thất bại. |
| `workers/student-sync.worker.ts` | `StudentSyncWorker` | Worker (Queue Consumer) | Lắng nghe queue `student-sync`. Khi nhận `jobId`, gọi `StudentSyncService.processJob()`. Đảm bảo job không chạy song song cho cùng jobId. |

### 8.4 Cron Jobs (`src/modules/background/cron/`)

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `cron/payment-timeout.cron.ts` | `PaymentTimeoutCron` | Cron Job (`@Cron`) | Chạy mỗi 1 phút (`@Cron('*/1 * * * *')`). Tìm tất cả `payments WHERE status='PENDING' AND timeout_at < NOW()`, mark thành `TIMEOUT`, `INCR seat:available:{workshopId}` trên Redis (nhả ghế), cập nhật `registration.status = CANCELLED`. Ghi số lượng xử lý vào log. |
| `cron/reconciliation.cron.ts` | `ReconciliationCron` | Cron Job (`@Cron`) | Chạy mỗi 10 phút. Với mỗi workshop PUBLISHED: đọc Redis `seat:available:{id}` và so sánh với giá trị tính từ PostgreSQL (`total - locked - confirmed`). Log sai lệch nếu có. Nếu sai lệch vượt ngưỡng an toàn, alert. Đây là safety net, không phải source of truth. |

### 8.5 Repositories

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `repositories/notification-logs.repository.ts` | `NotificationLogsRepository` | Repository | `findMany(filters, pagination)`, `findById(id)`, `create(data)`, `updateStatus(id, status, sentAt?, errorMsg?)`. Index: `idx_notif_status` (partial WHERE PENDING) để worker query job chờ gửi. |
| `repositories/notification-channel-configs.repository.ts` | `NotificationChannelConfigsRepository` | Repository | `findAll()`, `findByChannelType(type)`, `update(channelType, data)`. Dữ liệu tương đối static, có thể cache trong memory. |
| `repositories/ai-summaries.repository.ts` | `AiSummariesRepository` | Repository | (Cũng có thể import từ Catalog module nếu muốn tránh duplicate). `findByDocumentId`, `upsert`, `updateStatus`. |
| `repositories/student-sync-jobs.repository.ts` | `StudentSyncJobsRepository` | Repository | `create(data)`, `updateStatus(id, status, counts?)`, `findById(id)`, `findMany(pagination)`. |
| `repositories/student-sync-errors.repository.ts` | `StudentSyncErrorsRepository` | Repository | `createBatch(errors[])`, `findByJobId(jobId, pagination)`. |

### 8.6 DTOs

| File | Component | Loại | Mô tả chức năng |
|---|---|---|---|
| `dto/notification-response.dto.ts` | `NotificationLogResponseDto` | Response DTO | Shape: `{ notification_id, user_id, workshop_id?, type, channel, status, payload, sent_at?, error_message?, created_at }`. |
| `dto/update-channel-config.dto.ts` | `UpdateChannelConfigSchema` / `UpdateChannelConfigDto` | Request DTO (Zod) | Validate `{ is_active: boolean, config_json?: object }`. |
| `dto/trigger-student-sync.dto.ts` | `TriggerStudentSyncSchema` / `TriggerStudentSyncDto` | Request DTO (Zod) | Validate `{ source_file_name: z.string().min(1) }`. |
| `dto/student-sync-response.dto.ts` | `StudentSyncJobDto`, `StudentSyncErrorDto` | Response DTO | `StudentSyncJobDto`: full job status. `StudentSyncErrorDto`: `{ error_id, row_number, raw_data, error_reason, error_detail, created_at }`. |
| `dto/system-monitor-response.dto.ts` | `CircuitBreakerStatusDto`, `PaymentTimeoutJobStatusDto`, `ReconciliationJobStatusDto` | Response DTO | Ba shape cho 3 monitoring endpoints. `CircuitBreakerStatusDto`: `{ gateway, state, failure_count, opened_at?, last_attempt? }`. |

---

## 9. Tổng kết — Danh sách Module Files

| File | Component | Mô tả |
|---|---|---|
| `src/modules/iam/iam.module.ts` | `IamModule` | Khai báo tất cả controllers, services, repositories của IAM. Import `DatabaseModule`, `RedisModule`. Export `TokenService` (JwtAuthGuard cần). |
| `src/modules/catalog/catalog.module.ts` | `CatalogModule` | Khai báo tất cả components của Catalog. Export `WorkshopsService`, `SeatCounterService` (Booking cần). |
| `src/modules/booking/booking.module.ts` | `BookingModule` | Khai báo tất cả components của Booking. Import `CatalogModule`. Export `RegistrationsRepository`, `PaymentsRepository` (Background cron cần). |
| `src/modules/checkin/checkin.module.ts` | `CheckinModule` | Khai báo tất cả components của Checkin. Import `CatalogModule`, `BookingModule`. |
| `src/modules/background/background.module.ts` | `BackgroundModule` | Khai báo tất cả components. Import `BookingModule`, `CatalogModule`. Cần cài đặt `@nestjs/schedule` cho Cron và queue library (Bull/BullMQ) cho Workers. |
| `src/app.module.ts` | `AppModule` | Root module. Import: `IamModule`, `CatalogModule`, `BookingModule`, `CheckinModule`, `BackgroundModule`. Cũng import `DatabaseModule` và `RedisModule` (Global — không cần import lại trong feature modules). Khai báo global `JwtAuthGuard` và `RolesGuard` như `APP_GUARD` providers nếu muốn áp dụng globally. |

---

## 10. Số lượng tổng kết Component

| Loại | Số lượng |
|---|---|
| Guards | 4 |
| Decorators | 4 |
| Shared Infrastructure (Redis) | 2 |
| Controllers | 14 |
| Services | 22 |
| Mechanics (Redis operations) | 5 |
| Workers | 3 |
| Cron Jobs | 2 |
| Repositories | 18 |
| Request DTOs (Zod schemas) | 22 |
| Response DTOs | 20 |
| Module files | 6 |
| **Tổng cộng** | **~122 components** |
