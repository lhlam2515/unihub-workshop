---
paths:
  - "apps/**/src/**/*.{ts,tsx}"
---

# JSDoc & Comment Convention (Pragmatic Documentation)

> **Note:** All API documentation (JSDoc & Comments) in this repository should be written in English.

## Overview

This document establishes the **Documentation Mental Model** for the UniHub Workshop codebase. Its purpose is to ensure that both human developers and AI agents (like Claude) can instantly infer the intent, constraints, and side effects of a function without needing to read its full implementation.

**The core philosophy:** We do not want *more* comments; we want *higher-signal* documentation that reduces ambiguity, enforces architectural boundaries, and perfectly aligns with our `Result<T>` Error Handling pattern.

---

## 1. Documentation Philosophy: Intent over Implementation

**Rule:** Documentation MUST explain **WHY** the function exists and **WHAT** business value it delivers, NOT *how* the code executes under the hood.

- ✅ **Good:** `Acquires a distributed Redis lock to prevent double-booking of a workshop seat.`
- ❌ **Bad:** `Calls redis.setNxEx and checks if the result is OK.`

### Design Rationale

1. **Cognitive Load Reduction:** Developers should treat functions as black boxes. They only need to know the input, output, and side effects.
2. **Abstraction Preservation:** Implementations change (e.g., swapping Redis for another lock mechanism), but the intent remains stable.
3. **AI Reasoning Alignment:** LLMs rely heavily on semantic intent descriptions to generate correct downstream orchestration logic.

---

## 2. Mandatory Documentation Coverage

**Rule:** All non-trivial functions MUST include a JSDoc block.

| Function Visibility / Type | Documentation Requirement |
| :--- | :--- |
| **Public methods** | Full Contract JSDoc (REQUIRED) |
| **Protected methods** | Full Contract JSDoc (REQUIRED) |
| **Private methods** | Summary (REQUIRED if logic is non-obvious) |
| **Helper functions** | Summary + Params (unless trivial) |

### Definition of a "Trivial Function"

A function is exempt from JSDoc if it meets ALL of the following criteria:

1. It contains single-line logic.
2. It has absolutely zero side effects (pure function).
3. The function name fully and unambiguously describes its behavior (e.g., `const isEmpty = (arr: any[]) => arr.length === 0`).

---

## 3. JSDoc Structure: The Contract-Oriented Format

A function is a formal contract between the caller and the callee. All JSDoc blocks MUST follow this strict structure:

```typescript
/**
 * [1. Summary Line - Intent encoded as an active verb]
 *
 * [2. Optional: Detailed description, Business Rules, Side Effects]
 *
 * @param {name} - [3. Semantic meaning of input]
 * @returns [4. Output semantics, specifically addressing Result<T>]
 * @throws [5. Only for catastrophic failures or framework exceptions]
 */
```

### 3.1. Summary Line (Intent Encoding)

- **Constraint:** Exactly one line.
- **Constraint:** Start with a present-tense active verb (e.g., *Creates*, *Calculates*, *Retrieves*, *Validates*).
- **Constraint:** Zero filler words.
- ❌ `This function is used to fetch the user data...`
- ✅ `Retrieves the active user profile by their system ID.`

### 3.2. Parameter Documentation (Semantic Layer)

- **Rule:** `@param` MUST describe the *domain meaning* and *constraints*, NOT the TypeScript type.
- **Object Destructuring:** Use dot notation to explain complex DTOs.
- ❌ `@param id string` *(Redundant, TS already knows it's a string)*
- ✅ `@param dto.email - The student's institutional email address (must be unique).`

### 3.3. Return & Failure Contracts (Adapted for ROP)

Because this project utilizes Railway Oriented Programming (`Result<T, AppError>`), standard `@throws` tags are rarely applicable in the Service layer.

- **Rule:** Use `@returns` to describe both the successful payload AND the specific `ErrorCode`s that can be returned in a `FailResult`.
- **Rule:** Use `@throws` ONLY when a function intentionally throws an unhandled exception (e.g., `ZodValidationException` in Pipes, or raw errors in scripts).
- ✅ `@returns OkResult containing the RegistrationDto, or FailResult (SEAT_UNAVAILABLE, REGISTRATION_DUPLICATE).`

### 3.4. Side Effects & Business Rules (Critical for Services)

State mutations are invisible in function signatures. You MUST document them.

- **Side Effects:** DB writes, Redis mutations, Webhook emissions, Event firing.
- **Business Rules:** Domain invariants that govern the logic.

```typescript
 * Business rules:
 * - A student can only register once per workshop.
 * - Workshop capacity cannot be exceeded (enforced via Redis DECR).
 *
 * Side effects:
 * - Mutates the `seat:available:{id}` key in Redis.
 * - Inserts a new record into the `registrations` table.
```

---

## 4. Layer-Specific Documentation Models

Different architectural layers require different documentation focuses.

### 4.1. Controller Methods (`*.controller.ts`)

- **Focus:** HTTP Contract and Security routing.
- **Required:** Summary, `@param` (Payload source), Security/Role context.
- *Note:* Do not document business logic here; defer to the Service.

### 4.2. Service Methods (`*.service.ts`)

- **Focus:** Core Business Logic and Orchestration.
- **Required:** Summary, `@param`, `@returns` (Explicitly listing `ErrorCode`s), **Business rules**, and **Side effects**.

### 4.3. Repository Methods (`*.repository.ts`)

- **Focus:** Data Persistence and Locking Mechanisms.
- **Emphasis:** Database interaction clarity (e.g., "Uses Pessimistic Locking `FOR UPDATE`", "Relies on partial unique index").

---

## 5. Inline Comments: Local Reasoning

**Rule:** Inline comments explain **WHY**, never **WHAT**. The code itself is the "what".

- ❌ `// Increment the retry counter by 1` *(Useless noise)*
  `retryCount++;`
- ✅ `// Compensating action: Release the Redis lock because the DB transaction failed`
  `await this.redis.del(lockKey);`

---

## 6. Strict Anti-Patterns

1. **Type Duplication:** Never write `@param {string} id` if the parameter is typed as `id: string` in TypeScript.
2. **Vague Language:** Ban words like "Handles data", "Processes the request", or "Manages the logic". Be precise.
3. **Ghost Errors:** Failing to list the `ErrorCode`s returned by a Service method, forcing the consumer to read the implementation to know what errors to handle.

---

## 7. AI Agent Behavior Model (Instructions for Claude/Cursor)

When generating code or documentation in this repository, you (the AI) MUST adhere to the following directives:

- **MUST:** Generate complete JSDoc blocks for all new Controller, Service, and Repository methods.
- **MUST:** Infer and explicitly list side effects (e.g., if you write an `INSERT` statement, document "Side effect: Writes to database").
- **MUST:** Read the `ErrorCode` types from `src/shared/response/types.ts` and list the exact enum strings in the `@returns` documentation when returning a `Result.fail()`.
- **MUST NOT:** Invent behaviors, side effects, or error codes that are not present in the implemented code.
- **SHOULD:** Optimize for readability and vertical scanning. Prefer bullet points for rules and side effects over long paragraphs.

---

## 8. The Gold Standard Example

Below is the definitive example of how a critical Service method should be documented in this project.

```typescript
/**
 * Reserves a seat for a student in a specific workshop.
 *
 * Business rules:
 * - Workshop must be in 'PUBLISHED' status.
 * - Seat availability is strictly enforced via Redis atomic decrements.
 * - A student cannot hold multiple active registrations for the same workshop.
 *
 * Side effects:
 * - Decrements `seat:available:{workshopId}` in Redis.
 * - Creates a temporary 15-minute seat lock in Redis `seat:lock:{workshopId}:{regId}`.
 * - Inserts a new PENDING registration into the PostgreSQL database.
 *
 * @param workshopId - The UUID of the target workshop.
 * @param studentId - The UUID of the student requesting the seat.
 * @returns An OkResult with the ReservationDto (containing lock expiry), 
 * or a FailResult with codes:
 * - SEAT_UNAVAILABLE: If capacity is reached.
 * - REGISTRATION_DUPLICATE: If student is already registered.
 * - WORKSHOP_NOT_PUBLISHED: If the workshop is not open for booking.
 */
async reserveSeat(workshopId: string, studentId: string): Promise<Result<ReservationDto>> {
  // Implementation...
}
```
