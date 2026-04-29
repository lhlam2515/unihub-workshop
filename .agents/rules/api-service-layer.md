---
paths:
  - "apps/**/src/lib/api/**/*.ts"
  - "apps/**/src/features/*/api/*.service.ts"
  - "apps/**/src/features/*/api/*.action.ts"
---

# Service Layer Architecture (Frontend API Consumer)

This document defines the principles, patterns, and mental models for implementing the service layer in the UniHub Frontend (Next.js / Expo). It ensures type-safe data flow, proper error handling, and maintainable separation of concerns when communicating with the NestJS Backend.

> All references to file paths are relative to the root of the application (e.g., `apps/web/src/...` or `apps/mobile/src/...`).

---

## Mental Model: The Restaurant

To understand our frontend service architecture, visualize a restaurant workflow where the actual "cooking" (database transactions) happens in a remote kitchen (NestJS):

- **The Delivery Network** (`src/lib/api/client/index.ts`) — Transport ingredients and dishes.
  - Automatically attaches Access Tokens, handles 401 retries, and throws structured `ApiError`s.
  - Has no knowledge of business workflows; strictly handles HTTP networking.
- **Head Chefs** (`src/features/*/api/*.service.ts`) — Orchestrate recipes on the frontend.
  - `RegisterWorkshopService.execute()` calls the Delivery Network.
  - Translates NestJS business errors (e.g., `OVERSELL`) into UI-safe `Result<T>` patterns (never throws to the UI).
- **Server Actions / Hooks** (`src/features/*/api/*.action.ts`) — Serve the dish to customers.
  - Check `Result` success/failure, apply Zod validation, revalidate cache, and format responses for React components.

---

## Layer 1: Shared API Client (The Transport Layer)

Location: `src/lib/api/client/index.ts`

### Core Responsibility

- Manage HTTP connections (Axios/Fetch) to the NestJS backend.
- Handle Authentication (Bearer tokens, automatic Refresh Token rotation).
- Standardize all incoming HTTP/Network errors into a single `ApiError` class.
- Provide the `api` object with typed methods (`get()`, `post()`, etc.) for HTTP requests.

### Implementation Rules

**1. Centralized HTTP Calls**

```typescript
// src/lib/api/client/index.ts
export const api = {
  // typed HTTP helpers live here
};

// request(), http.ts, and auth-session.ts handle token injection and 401 retries
```

- Components and Feature Services MUST NEVER use raw `fetch()` or `axios.get()` directly.
- Ensures all requests carry the correct headers and tracing IDs.

**2. Throw Structured Errors (Don't Catch Here)**

```typescript
function normalizeApiError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  throw new ApiError(0, {
    code: "NETWORK_ERROR",
    message: "Connection failed",
  });
}
```

- Errors propagate to Feature Services to be wrapped safely.

---

## Layer 2: Feature Services (Translation Layer)

Location: `src/features/[feature-name]/api/[feature].service.ts`

### Core Responsibility

- Act as the bridge between the UI and the Backend API.
- Apply frontend-side domain logic or data transformation.
- Wrap all network operations in `Result<T>` (never throw exceptions to the UI).

### Implementation Pattern

**1. Wrap Everything in Result.fromPromise**

```typescript
import { api } from "@/lib/api/client";
import { Result } from "@/lib/result";

class RegisterWorkshopService {
  async register(workshopId: string): Promise<Result<{ registrationId: string }>> {
    return Result.fromPromise(api.post(`/workshops/${workshopId}/register`));
  }
}

export const registerWorkshopService = new RegisterWorkshopService();
```

- NEVER propagate raw HTTP exceptions to Server Actions or UI Components.
- Encapsulate error inside the `Result` object.

**2. Frontend Data Transformation (If needed)**

```typescript
async getWorkshopDetails(id: string): Promise<Result<WorkshopDetail>> {
  const result = await Result.fromPromise(api.get(`/workshops/${id}`));
  
  if (result.isSuccess) {
    // Transform backend Date strings to JS Date objects before giving to UI
    result.data.startTime = new Date(result.data.startTime);
  }
  
  return result;
}
```

---

## Layer 3: Server Actions / Hooks (Entry Point)

Location: `src/features/[feature-name]/api/[feature].action.ts`

### Pattern (Next.js Server Action)

```typescript
"use server";
import { revalidatePath } from "next/cache";

export async function submitRegistration(
  params: z.infer<typeof RegisterSchema>
): Promise<ActionResponse<{ registrationId: string }>> {
  // 1. Validate Input
  const validationResult = RegisterSchema.safeParse(params);

  if (!validationResult.success) {
    return handleError(validationResult);
  }

  // 2. Delegate to Feature Service
  const result = await registerWorkshopService.register(validationResult.data.workshopId);

  // 3. Handle Result
  if (result.isFailure) {
    return handleError(result.error); // Formats ApiError for UI Toast
  }

  // 4. Update Next.js Cache
  revalidatePath('/workshops');

  return { success: true, data: result.data };
}
```

### Responsibilities

1. **Validate** — Use schema parsing (`safeParse`) to validate input against Zod schema.
2. **Delegate** — Call Feature Service.
3. **Handle Result & Cache** — Process `Result.isFailure` via `handleError()`, or trigger `revalidatePath()` / `queryClient.invalidateQueries()` on success.

---

## Error Handling: Result Pattern

The `Result<T>` type-safely encapsulates success or failure without exceptions:

```typescript
// Success case
if (result.isSuccess) {
  console.log(result.data); // Strongly typed Payload from NestJS
}

// Failure case
if (result.isFailure) {
  console.log(result.error.code); // e.g., 'OVERSELL'
  console.log(result.error.message); // e.g., 'The workshop is fully booked.'
}
```

**Key Benefits:**

- Errors are explicit (first-class values, not exceptions).
- Flat, readable code (no deep try-catch nesting).
- Type-safe: accessing `.data` on failure throws a compile-time/runtime error.

---

## API Integration Best Practices

### 1. Let the Backend do the Heavy Lifting

```typescript
// ✅ Correct: Let NestJS handle filtering and sorting via query params
const result = await api.get('/workshops', { 
  params: { status: 'PUBLISHED', sort: 'desc' } 
});

// ❌ Wrong: Fetching everything and sorting on the Frontend
const allWorkshops = await api.get('/workshops');
const filtered = allWorkshops.data.filter(w => w.status === 'PUBLISHED');
```

### 2. Idempotency Key Injection

For payment or critical state-changing actions, inject idempotency keys at the Action or Service layer.

```typescript
import { v4 as uuidv4 } from 'uuid';

async processPayment(registrationId: string) {
  return Result.fromPromise(
    api.post(`/payments/checkout`, { registrationId }, {
      headers: { 'X-Idempotency-Key': uuidv4() }
    })
  );
}
```

### 3. Separation of Queries and Commands (CQS)

- **Queries (GET):** Often called directly in Next.js Server Components or via React Query (`useQuery`) in Expo.
- **Commands (POST/PUT/DELETE):** Handled strictly via Server Actions (Next.js) or Mutations (`useMutation` in Expo) triggering the Feature Services.

---

## SOLID Principles Mapping (Frontend Context)

| Principle | Implementation                                                                |
| --------- | ----------------------------------------------------------------------------- |
| **SRP** | Separate Network Logic (`lib/api`) from Business Action (`Feature Service`)     |
| **OCP** | Create new Feature Services for new endpoints without modifying existing ones   |
| **LSP** | `Result<T>` guarantees consistent return shapes across all API responses        |
| **ISP** | Pass only needed parameters (DTOs) to services, not entire Form event objects   |
| **DIP** | UI depends on Feature Services, not directly on `axios` or `fetch`              |

---

## Summary: The Three-Step Flow

1. **Shared API Client** — Manages HTTP request, throws `ApiError` if NestJS returns 4xx/5xx.
2. **Feature Service** — Catches `ApiError`, wraps in `Result<T>`, handles UI data transformation.
3. **Server Action / React Hook** — Checks `Result`, handles Zod validation, formats error for the Client, triggers Cache Revalidation.

Follow this flow, and your UI components will never crash from unhandled promises, and network logic remains completely isolated.
