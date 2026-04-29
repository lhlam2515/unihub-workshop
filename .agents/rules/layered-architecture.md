---
paths:
  - "apps/server/src/**/*.ts"
---

# Modular Monolith & Layered Architecture

## Overview

This backend project applies a **Modular Monolith** pattern combined with strict **Layered Architecture**. The codebase is vertically sliced by Bounded Contexts (e.g., `iam`, `catalog`, `booking`, `checkin`) and horizontally divided into functional layers (Presentation, Business, Data Access).

This structure is strictly enforced by `eslint-plugin-boundaries` to maintain high cohesion, low coupling, and predictable data flows.

**Core Goal:** Isolate business domains from one another, centralize data schemas, and ensure that HTTP/Framework-specific logic never leaks into business rules.

> All references to file paths are relative to the root of the server application (e.g., `apps/server/src/...`).

---

## Mental Models

### 1. The Single Source of Truth (Schema-First)

- **Database Layer (`src/database`)** is the absolute foundation.
- Types are **inferred** directly from Drizzle ORM schemas using `drizzle-zod`.
- Instead of manually writing interfaces/Contracts for inter-module communication, Services pass around types inferred directly from the database schema.

### 2. The Restaurant Model (Backend Edition)

A metaphor for separating concerns across layers:

- **The Front Desk (Presentation Layer / `controllers` & `dto`)**: Receives requests, checks IDs (Auth Guards), and validates the order format (Zod DTOs). It knows nothing about how the food is cooked. It simply hands the result back to the customer.
- **The Kitchen (Business Layer / `services`)**: The heart of the application. It takes the validated order, applies business rules (e.g., checking seat availability, calculating prices), and orchestrates the process. It returns a safe `Result<T, AppError>` object.
- **The Pantry (Data Access Layer / `repositories`)**: Knows exactly how to find and store ingredients (Database). It executes Drizzle queries, handles PostgreSQL constraints, and translates raw database errors into the application's domain errors.

---

## Folder Mapping & Layer Boundaries

### 🏦 The Foundation Layers (Global)

Available globally to support the feature modules.

```text
src/
├── database/        # Single Source of Truth. Drizzle schemas, migrations, and inferred types.
├── core/            # Framework configuration: Guards, Filters, Interceptors, App/Db Modules.
└── shared/          # Domain-agnostic utilities: Response Builder, Result Pattern, Custom Errors.
```

### 📦 Feature Modules Layer → `src/modules/[module-name]/`

Each module represents a Bounded Context and strictly follows Layered Architecture.

```text
src/modules/booking/
├── controllers/     # Presentation: Handles HTTP requests, Guards, and routing.
├── services/        # Business: Core logic, transaction orchestration.
├── repositories/    # Data Access: Drizzle ORM query execution.
└── dto/             # Presentation Data: Zod schemas for request validation.
```

---

## Workflow: How to Implement an API Endpoint

Follow the **"Contract-First, Bottom-Up"** implementation strategy:

### Step 1: Data & Types (`src/database/schema/*.ts`)

Ensure the database schema supports your feature. Export the inferred type for cross-layer usage.

```typescript
export const selectWorkshopSchema = createSelectSchema(workshops);
export type WorkshopType = z.infer<typeof selectWorkshopSchema>;
```

### Step 2: Request Validation (`dto/*.dto.ts`)

Create a Zod schema to validate incoming client data.

```typescript
const createRegistrationSchema = z.object({ workshopId: z.string().uuid() });
export class CreateRegistrationDto extends createZodDto(createRegistrationSchema) {}
```

### Step 3: Data Access (`repositories/*.repository.ts`)

Write the raw DB query. Wrap it in `tryCatch` to map unexpected DB errors to the `Result` pattern.

```typescript
async create(data: NewReg): Promise<Result<RegistrationType>> {
  return tryCatch(
    async () => {
      const [inserted] = await this.db.insert(schema.registrations).values(data).returning();
      return inserted;
    },
    (err) => systemErrors.internal('DB write failed', err)
  );
}
```

### Step 4: Business Logic (`services/*.service.ts`)

Orchestrate the feature. **Never `throw` exceptions here.** Always return `Result.ok()` or `Result.fail()`.

```typescript
async processRegistration(dto: CreateRegistrationDto): Promise<Result<RegistrationType>> {
  const isAvailable = await this.seatCounter.check(dto.workshopId);
  if (!isAvailable) return Result.fail(seatErrors.unavailable(dto.workshopId));
  
  return this.repository.create(dto); // Returns Result automatically
}
```

### Step 5: Presentation (`controllers/*.controller.ts`)

Keep it incredibly thin. Attach Guards, inject the Zod DTO, and return the `Result` directly. The global `ResponseInterceptor` handles HTTP mapping.

```typescript
@Post()
@UseGuards(JwtAuthGuard)
async register(@Body() payload: CreateRegistrationDto) {
  return this.bookingService.processRegistration(payload);
}
```

---

## Golden Anti-Patterns to Avoid

### 1. The Fat Controller

❌ **Wrong:** Writing business logic, `if/else` checks, or database calls inside `*.controller.ts`.
✅ **Right:** Controllers only extract payload/user data and call `this.service.doSomething()`.

### 2. Throwing Exceptions in Services

❌ **Wrong:** Using `throw new BadRequestException()` inside a Service. This tightly couples business logic to the HTTP framework.
✅ **Right:** Return `Result.fail(appError)`. Let the Interceptor/Filter handle the HTTP translation.

### 3. Bypassing Cross-Module Boundaries

❌ **Wrong:** `BookingService` imports `CatalogRepository` to query workshops directly.
✅ **Right:** `BookingService` imports `CatalogService` (Business-to-Business communication) to ensure all catalog business rules are respected.

### 4. Direct Drizzle Calls in Services

❌ **Wrong:** Injecting `DRIZZLE` directly into a Service to run a quick query.
✅ **Right:** All database interactions MUST go through a Repository.

---

## Strict ESLint Boundaries Enforcement

The architectural rules are mechanically enforced via `eslint-plugin-boundaries` in `server.cjs`. If you violate these, the linter will fail your build.

| Layer (From) | Allowed Dependencies (Can Import To) | Blocked (Cannot Import) |
| :----------- | :----------------------------------- | :---------------------- |
| **`core`** | `core`, `shared` | Modules, DB |
| **`database`** | `database`, `core`, `shared` | Modules |
| **`presentation`** | `core`, `shared`, `business` *(Same module only)*, `dto` *(Same module only)* | Repositories, DB |
| **`business`** | `core`, `shared`, `database`, `data-access` *(Same module)*, `dto` *(Same module)*, **`business` *(Any module)*** | Controllers |
| **`data-access`** | `core`, `shared`, `database`, `dto` *(Same module only)* | Controllers, Services |

*Note: The **Business layer (`services`)** is the ONLY layer permitted to communicate across different modules (e.g., `BookingService` calling `CatalogService`). This enables the Open/Closed Principle for inter-module orchestration.*
