---
paths:
  - "apps/**/src/components/**/*.tsx"
  - "apps/**/src/features/**/*.tsx"
  - "apps/**/src/widgets/**/*.tsx"
  - "apps/**/src/app/**/*.tsx"
---

# Feature-Sliced Design (Pragmatic FSD)

## Overview

Feature-Sliced Design (FSD) is an architectural methodology that organizes code into layers with decreasing abstraction and scope. However, this project applies **Pragmatic FSD**—mapping FSD principles to Next.js App Router's natural structure (`app`, `widgets`, `features`, `components`, `lib/api`) while maintaining high cohesion and low coupling through ESLint Boundaries.

**Core Goal:** Organize code so that each feature owns its logic, dependencies flow downward, and changes remain isolated.

> All references to file paths are relative to the root of the application (e.g., `apps/web/src/...` or `apps/mobile/src/...`).

---

## Mental Models

### 1. Nouns vs. Verbs

- **Entities (Nouns):** `Workshop`, `Ticket`, `User`, `Registration` — static domain objects
  - Live in: `src/components/cards` (Entity Components, read-only UI)
  - No API calls, no complex state, no Server Actions
- **Features (Verbs):** `register-workshop`, `process-payment`, `sync-students` — user actions delivering business value
  - Live in: `src/features/[feature-name]/`
  - Each feature solves exactly ONE use-case (Single Responsibility)

### 2. The Restaurant Model (API Consumer Edition)

A metaphor for separating concerns across layers when integrating with a NestJS backend:

- **Prep Cooks** (`NestJS Backend API`) — Handle raw data, database transactions, and ACID constraints (e.g., Redis Seat Locks).
  - Zero knowledge of frontend UI workflows.
- **The Delivery Network** (`src/lib/api/client.ts`) — Transport data safely.
  - Handles access tokens, intercepts 401 errors, and manages token refreshes automatically.
- **Head Chefs** (`src/features/*/api`) — Orchestrate recipes on the frontend.
  - `RegisterWorkshopService` calls the NestJS API via `api`.
  - Implements UI-side domain logic and error translation (returning `Result<T>`).
- **Tray Composers** (`src/widgets/`) — Group entities and features into logical, reusable blocks.
  - A tray holds the steak (`WorkshopCard` Component) alongside salt and pepper (`RegisterButton` Feature).
  - Do not fetch data directly; rely entirely on props.
- **Expedition Pass** (`src/app/.../page.tsx`) — Plate and compose the dish.
  - Fetch data, arrange Widgets, and serve to the client.

---

## Folder Mapping to FSD Layers

### 📦 Entities Layer → `src/components/` (Shared)

Defines the "shape" of data and its visual representation.

```text
src/components/
├── cards/           # Entity UI Components (WorkshopCard, TicketCard, etc.)
├── badges/          # Reusable badge components (StatusBadge)
├── ui/              # shadcn/ui primitives
└── navigation/      # Navbar, sidebars
```

**Rules:**

- MUST be stateless or use only local UI state
- NO Server Actions, NO API calls, NO feature-specific logic
- Importable from anywhere

### ⚙️ Features Layer → `src/features/` (Feature Boundary)

Defines user-facing behaviors and interactions.

```text
src/features/register-workshop/
├── api/
│   ├── register.action.ts     # Server Action (Form handler & Error wrapper)
│   └── register.service.ts    # Orchestration logic (Calls apiClient)
├── components/
│   └── RegisterForm.tsx       # Form Component (Client Component)
└── lib/
    └── schema.ts              # Zod validation schema
```

**Rules:**

- One feature = ONE user workflow
- Features CANNOT import other features
- Features CAN import from shared layers and `src/components/`
- All backend API access flows through Feature Service → `api`

### 🧩 Widgets Layer → `src/widgets/` (Composition Layer)

Bridges the gap between App and Features by composing multiple entities and features into reusable layout blocks, preventing "God Components" in the App layer.

```text
src/widgets/workshop-detail-board/
└── WorkshopDetailWidget.tsx      # Combines WorkshopDetailInfo (Component) + RegisterForm (Feature)
```

**Rules:**

- **Dumb Orchestrators:** MUST NOT fetch data directly or contain Server Actions. All data must be passed down as props from the App layer.
- **No Business Logic:** Used purely for layouting and composition.
- **The "2+ Rule":** A Widget MUST compose at least 1 Entity Component AND 1 Feature. Never create a widget for a simple UI element.

### 🌐 Pages Layer → `src/app/[route]/page.tsx`

Composes widgets into complete pages and handles data fetching.

**Pattern:**

```tsx
// src/app/(public)/workshops/[id]/page.tsx

// 1. Fetch data through service (Directly calls NestJS via HTTP)
const result = await viewWorkshopService.getWorkshopById(id);
if (result.isFailure) return <ErrorState />;

// 2. Compose Widgets
return (
  <div className="layout">
    <WorkshopDetailWidget workshop={result.data} />
  </div>
);
```

### 🗄️ Shared Infrastructure → `src/lib/`, `src/types/`

Cross-cutting concerns available to all layers:

- `src/lib/api/` — API Client configuration, interceptors, and error handling (`client.ts`, `errors.ts`, `types.ts`).
- `src/lib/handlers/error.ts` — Utility to parse and format API errors into a consistent `Result<T>` structure.
- `src/lib/result.ts` — Generic `Result<T>` type for success/failure handling across the app.
- `src/types/` — Global type definitions (reflecting NestJS DTOs).

---

## Interaction Flow

```text
Page Component (page.tsx)
    ↓
Widget Component (Optional layout grouping)
    ↓
Feature Service (register.service.ts)
    ↓
Shared API Client (src/lib/api/client)
    ↓
NestJS API Backend
```

When a user submits a form:

1. Form calls `submitRegistration()` Server Action (`.action.ts`)
2. Action validates input and authorizes user
3. Action delegates to `RegisterWorkshopService.register()`
4. Service calls `api.post('/registrations')` and catches HTTP errors.
5. Service returns `Result<T>` (success or formatted ApiError).
6. Action parses the `Result` via `handleError` and returns a typed response to the client.

---

## Golden Anti-Patterns to Avoid

### 1. Fat Service Problem

❌ **Wrong:** Dumping all logic into a single generic `WorkshopService`.
✅ **Right:** Create specific services like `RegisterWorkshopService` or `PublishWorkshopService` based on the exact feature command.

### 2. Feature Pollution

❌ **Wrong:** Placing shared UI components in `src/features/register-workshop/components/`
✅ **Right:** Move to `src/components/ui/` or `src/components/cards/`

### 3. Layer Breach

❌ **Wrong:** Page or Widget component calls `api.get()` directly.
✅ **Right:** Page → Feature Service → API Client.

### 4. Feature Cross-Dependency

❌ **Wrong:** `register-workshop` feature imports from `process-payment` feature.
✅ **Right:** Extract shared logic to the `src/lib` layer, or compose them together inside a Widget.

### 5. Entity Component with Logic

❌ **Wrong:** `WorkshopCard` contains `onClick` handlers that make API calls.
✅ **Right:** Pass callbacks as props; handle logic in Feature/Page layer.

---

## Summary: ESLint Boundaries Enforcement

The project enforces these import rules via `eslint-plugin-boundaries`:

| From         | Can Import                      | Cannot Import                    |
| ------------ | ------------------------------- | -------------------------------- |
| `app`        | `widgets`, `features`, `shared` | Other `app` paths                |
| `widgets`    | `features`, `shared`            | Other `widgets`, `app`           |
| `features/*` | Same feature, `shared`          | Other features, `widgets`, `app` |
| `shared`     | Only `shared`                   | Features, `widgets`, `app`       |

*(Note: In this context, `shared` refers to anything in `src/components/`, `src/lib/`, and `src/types/`)*
