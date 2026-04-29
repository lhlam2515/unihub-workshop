# Coding Style & Naming Conventions

This document establishes an **Ubiquitous Language** for the DevFlow Monorepo (Next.js, React Native, NestJS). It reduces cognitive load and enables developers and AI agents to reason about code intent at a glance. Consistency here translates directly to code maintainability across the full stack.

---

## 1. Directory & File Naming: Kebab-case

**Rule:** All directories and files (except React Components) MUST use `kebab-case`. For NestJS backend files, suffix the file with its architectural layer.

**Frontend Examples:** `ask-question/`, `auth.action.ts`, `use-debounce.ts`
**Backend Examples:** `workshops-admin.controller.ts`, `registrations.repository.ts`, `seat-lock.mechanic.ts`

### Design Rationale

- **Web-Native Semantics (Next.js):** File-based Routing means directory names become URLs. `kebab-case` ensures alignment between file structure and routes (`/ask-question`).
- **Layer Transparency (NestJS):** Suffixes (`.controller.ts`, `.service.ts`) allow developers and IDE fuzzy-finders (Ctrl+P) to instantly identify the file's responsibility without reading its path.
- **Cross-Platform Safety:** Windows filesystems are case-insensitive; Linux is case-sensitive. `kebab-case` eliminates deployment failures in CI/CD pipelines.

---

## 2. React Component Naming: PascalCase (Frontend/Mobile)

**Rule:** Component filenames and function names must match and use `PascalCase`.

**Examples:** `QuestionCard.tsx`, `AskQuestionForm.tsx`, `UserAvatar.tsx`

### Design Rationale

- **JSX Differentiation:** React uses capitalization to distinguish custom components from HTML intrinsic elements.
- **Entity-Function-Type Pattern:** Structure as `[Entity][Function][Type]` (e.g., `Question` + `Preview` + `Card` = `QuestionPreviewCard`). This pattern immediately communicates purpose.

---

## 3. Widget Naming & Structure (Frontend/Mobile)

**Rule:** Widgets compose multiple entities and features. They must use **Nouns** (never verbs) and follow the formula: `[Domain] + [Context] + Widget`.

**Examples:** - ✅ `QuestionDetailWidget.tsx`, `AnswersSectionWidget.tsx`

- ❌ `RenderAnswersWidget.tsx` (Contains verbs; should be Features instead)

### Design Rationale

- **Structural Signaling:** The `Widget` suffix tells developers this is a "Dumb Orchestrator"—it does not fetch data directly and contains no business logic.

---

## 4. NestJS Class Naming: Architectural PascalCase (Backend)

**Rule:** All classes in NestJS must use `PascalCase` and strictly suffix their architectural role.

### Controllers (Presentation Layer)

- **Naming:** `[Resource][Scope?]Controller`
- **Examples:** `WorkshopsPublicController`, `UsersAdminController`, `RegistrationsController`
- **Mental Model:** Handles HTTP, Guards, and routing. Does not contain business logic.

### Services & Mechanics (Business Layer)

- **Naming:** `[Entity/Process]Service` or `[Process]Mechanic`
- **Examples:** `CatalogService`, `PaymentGatewayService`, `SeatLockMechanic`
- **Mental Model:** Orchestrates business rules and side effects.

### Repositories (Data Access Layer)

- **Naming:** `[Entities]Repository` (Pluralized noun)
- **Examples:** `WorkshopsRepository`, `CheckinRecordsRepository`
- **Mental Model:** Direct Drizzle ORM operations.

---

## 5. DTO & Validation Naming (Full Stack)

**Rule:** Zod schemas and TypeScript Types/Classes must be clearly separated and suffixed appropriately.

### Request Validation (Input)

- **Zod Schema:** `[Action][Resource]Schema` (e.g., `CreateWorkshopSchema`)
- **DTO Class/Type:** `[Action][Resource]Dto` (e.g., `CreateWorkshopDto`)

### Response Definition (Output)

- **DTO Class:** `[Resource]ResponseDto` or `[Resource][Context]Dto`
- **Examples:** `AuthMeResponseDto`, `WorkshopSummaryDto`, `WorkshopAdminDetailDto`

### Design Rationale

- **Zod-to-TS Bridge:** By suffixing `Schema` for the Zod object and `Dto` for the inferred type or NestJS validation class, we avoid naming collisions while keeping the relationship explicit.
- **Contextual Responses:** Suffixes like `Summary` vs `Detail` explicitly communicate the data payload's weight to the consumer.

---

## 6. Function & Method Naming: Command-Query Separation (CQS)

**Rule:** Use `camelCase` with verbs that signify intent—either data retrieval (Query) or state change (Command).

### Query Functions (Safe, No Side Effects)

- Prefix: `get`, `find`, `list`, `search`
- Examples: `getWorkshopById()`, `findPublishedWorkshops()`, `listRooms()`
- Mental Model: "This reads and returns; it doesn't modify the database."

### Command Functions (Mutations with Side Effects)

- Prefix: `create`, `update`, `delete`, `cancel`, `assign`
- Examples: `createRegistration()`, `cancelWorkshop()`, `assignWorkshops()`
- Mental Model: "This modifies state; expect database changes, Redis key mutations, or external webhook triggers."

---

## 7. Variable & State Naming: Self-Documenting Logic

**Rule:** Use `camelCase`. Nouns for data, adjectives for boolean state.

### Boolean Variables

- Prefix: `is`, `has`, `should`, `can`
- Examples: `isLoading`, `isPublished`, `canRegister`
- Mental Model: Condition statements read naturally: `if (workshop.isPublished) { ... }`

### Collection Variables

- Use plural form for arrays/Iterables.
- Examples: `workshops`, `allowedWorkshopIds` (not `workshopList`, `idArray`)
- Rationale: Type information is already in TypeScript; repeating it in variable names violates the DRY principle.

---

## 8. Feature & Module Structure: Bounded Contexts

### Frontend Features (`src/features/[feature-name]/`)

Isolates UI workflows.

```text
src/features/register-workshop/
├── api/              # Server actions & services
├── components/       # Feature-specific UI components
└── lib/              # Utilities, schemas
```

### Backend Modules (`src/modules/[module-name]/`)

Isolates business domains (Modular Monolith).

```text
src/modules/booking/
├── controllers/      # endpoints
├── services/         # business logic
├── repositories/     # data access
├── mechanics/        # complex redis/infra operations
└── dto/              # zod schemas
```

---

## 9. Constants Naming: Semantic Clarity

**Rule:** Use `UPPER_SNAKE_CASE` for module-level constants and configurations.

**Examples:**

```typescript
export const SEAT_LOCK_TTL_SECONDS = 900;
export const MAX_RETRY_ATTEMPTS = 3;
```

### Design Rationale

- **Immutability Signal:** All caps signals "this value never changes" at runtime. Separates configuration values from computational logic visually.

---

## Summary: The Full-Stack Mental Model

| Category | Pattern | Example | Stack |
|----------|---------|---------|-------|
| **Directories** | `kebab-case` | `ask-question/`, `booking/` | Both |
| **Backend Files** | `[resource].[layer].ts` | `catalog.service.ts` | Backend |
| **Components** | `PascalCase` | `QuestionCard.tsx` | Frontend |
| **Widgets** | `[Domain][Context]Widget` | `QuestionDetailWidget` | Frontend |
| **Controllers** | `[Resource][Scope]Controller` | `WorkshopsAdminController` | Backend |
| **Repositories**| `[Entities]Repository` | `TicketsRepository` | Backend |
| **Zod Schemas** | `[Action][Resource]Schema` | `CreatePaymentSchema` | Both |
| **Functions** | `camelCase` (Query/Command) | `getPublicDetail()`, `voidTicket()` | Both |
| **Booleans** | `camelCase` (is/has/can) | `isPaid`, `canCheckin` | Both |
| **Types/DTOs** | `PascalCase` (with suffix) | `RegistrationResponseDto` | Both |
| **Constants** | `UPPER_SNAKE_CASE` | `SEAT_LOCK_TTL_SECONDS` | Both |

These conventions form a cohesive **language** across the monorepo. It ensures that a frontend developer opening a backend service, or a backend engineer reviewing a UI feature, can instantly decode the architectural intent without needing to reverse-engineer the logic.
