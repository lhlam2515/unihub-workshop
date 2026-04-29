---
paths:
  - "apps/server/src/modules/**/*.ts"
  - "apps/server/src/core/**/*.ts"
---

# End-to-End API Implementation & Request Lifecycle

## Overview

This project uses **NestJS** with a strict **Modular Monolith** architecture. Every incoming HTTP request flows through a predictable 5-stage lifecycle. You MUST implement new API endpoints by respecting this lifecycle and utilizing the project's custom tools (Zod, Result Pattern, Drizzle ORM, ResponseInterceptor).

---

## 1. The 5-Stage Request Lifecycle (Mental Model)

When writing code for a new endpoint, visualize where your code lives in this flow:

1. **Inbound Security:** Global Middlewares → `JwtAuthGuard` / `RolesGuard` / `@Public()`.
2. **Validation:** `ZodValidationPipe` intercepts the request body/params. Bad data throws `ZodValidationException` (caught by `GlobalExceptionFilter`).
3. **Business Logic:** The Controller passes clean data to the **Service**. The Service orchestrates the logic (calling Repositories or Mechanics) and returns a `Result<T, AppError>`.
4. **Outbound Formatting:** The `ResponseInterceptor` catches the `Result`. If `OkResult`, it maps to a `200/201 ApiResponse`. If `FailResult`, it throws an `HttpException`.
5. **Exception Handling:** The `GlobalExceptionFilter` catches everything (AppErrors, 500s) and returns a sanitized JSON response to the client.

---

## 2. Implementation Workflow (Bottom-Up)

ALWAYS implement features starting from the data layer up to the presentation layer.

### Step 1: Request & Response DTOs (Validation Layer)

Define Zod schemas in `src/modules/{module}/dto/`.

- Use `createZodDto` to bridge Zod with NestJS.
- **Rule:** Request DTOs and Response DTOs MUST be strictly separated.

```typescript
// request.dto.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod/dto';

const schema = z.object({ workshopId: z.string().uuid() });
export class CreateRegDto extends createZodDto(schema) {}

// response.dto.ts
export class RegResponseDto {
  static from(entity: DBRegistration) {
    return { id: entity.id, status: entity.status }; // Strip internal fields
  }
}
```

### Step 2: Repository (Data Access Layer)

Repositories ONLY talk to Drizzle ORM.

- **Rule:** Wrap all DB calls in the `tryCatch` utility to return a `Result<T>`. Translate raw DB errors into `systemErrors`.

```typescript
// registration.repository.ts
async create(data: NewReg): Promise<Result<RegType>> {
  return tryCatch(
    async () => {
      const [inserted] = await this.db.insert(schema.registrations).values(data).returning();
      return inserted;
    },
    (err) => systemErrors.internal('DB write failed', err, { data })
  );
}
```

### Step 3: Service (Business Layer)

Services orchestrate business rules.

- **Rule:** NEVER use `throw new Exception()` inside a Service.
- **Rule:** ALWAYS return `Result.ok()` or `Result.fail()`.
- **Rule:** Use `Mechanics` (e.g., `SeatLockMechanic`) for complex Redis operations, do not clutter the Service.

```typescript
// registration.service.ts
async register(dto: CreateRegDto, studentId: string): Promise<Result<RegResponseDto>> {
  // 1. Business Check
  const isAvailable = await this.seatCounter.check(dto.workshopId);
  if (!isAvailable) return Result.fail(seatErrors.unavailable(dto.workshopId));

  // 2. Data Persistence
  const dbResult = await this.repository.create({ ...dto, studentId });
  if (dbResult.isFailure) return dbResult.propagate();

  // 3. Map to Response DTO
  return Result.ok(RegResponseDto.from(dbResult.data));
}
```

### Step 4: Controller (Presentation Layer)

Controllers MUST remain extremely thin.

- **Rule:** Apply `@UseGuards()` at the class level if possible.
- **Rule:** Apply `@UseInterceptors(ResponseInterceptor)` if not globally registered.
- **Rule:** Prevent IDOR (Insecure Direct Object Reference) by relying on `@CurrentUser()` token payload for user IDs, NOT request bodies.

```typescript
// registration.controller.ts
@Controller('registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class RegistrationController {
  constructor(private readonly service: RegistrationService) {}

  @Post()
  async create(
    @Body() dto: CreateRegDto, 
    @CurrentUser() user: JwtPayload
  ) { // Return type is implicit Promise<Result<...>>
    return this.service.register(dto, user.userId); 
  }
}
```

---

## 3. Strict Anti-Patterns (NEVER DO THESE)

1. **DO NOT format HTTP Responses manually:** Never use `@Res() res: Response` to return `res.status(200).json(...)` in a Controller. Return the `Result` object directly. The Interceptor handles the rest.
2. **DO NOT leak database schemas:** Never return raw entities (`typeof schema.table.$inferSelect`) directly from the Controller to the client. Always map it through a `ResponseDto.from()` factory.
3. **DO NOT use Try-Catch in Services:** Do not use native `try/catch` blocks in Services. Rely on the Repository's `Result` returns, and use `.isFailure` or `.isSuccess` type guards.
4. **DO NOT bypass the DTO:** Never use `@Body() body: any`. Every payload must be validated by a Zod DTO class.
