# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in the Next.js web app.

> **This is NOT the Next.js you know.** This version (16.x) has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Run, Build, Lint

```sh
pnpm dev           # next dev (Turbopack)
pnpm build         # next build
pnpm start         # next start
pnpm lint          # eslint
pnpm lint:fix      # eslint --fix
pnpm format        # prettier --write src/**/*.{ts,tsx}
```

## Architecture: Pragmatic Feature-Sliced Design

This app uses Next.js 16 App Router with a modified FSD that maps to Next.js conventions.

### Directory Map

```
src/
├── app/                       # Next.js App Router pages (data fetching + widget composition)
│   ├── layout.tsx             # root layout (providers, forced-logout handler)
│   ├── (public)/              # public routes — no auth required
│   │   └── workshops/         # listing + detail
│   ├── (auth)/                # auth routes — login
│   │   └── login/
│   ├── (student)/             # student-only routes (role guard)
│   │   └── me/                # registrations, tickets, payments, profile
│   │   └── payments/          # checkout, result
│   └── (admin)/               # organizer-only routes (role guard)
│       └── admin/             # dashboard, workshops, rooms, speakers, users, student-sync, notifications, system
├── widgets/                   # dumb orchestrators: compose entities + features, no data fetching
├── features/                  # one user workflow per folder
│   └── auth/
│       └── api/               # server actions + feature services
├── components/                # shared UI: cards, badges, shadcn/ui primitives, navigation
├── lib/
│   ├── api/
│   │   ├── client/            # HTTP client with token injection, 401 mutex, auth session
│   │   │   ├── index.ts       # api.get/post/put/patch/delete, login(), logout()
│   │   │   ├── http.ts        # request() with Bearer injection + single 401 retry
│   │   │   ├── auth-session.ts # acquireFreshToken() with mutex, onForcedLogout()
│   │   │   ├── token-store.ts # in-memory access token singleton
│   │   │   └── config.ts      # API_BASE_URL
│   │   ├── errors.ts          # ApiError class + type predicates (isAuthError, isValidationError, etc.)
│   │   └── types.ts           # ApiResponse, PaginatedData, RequestOptions, ErrorCode
│   ├── handlers/
│   │   └── error.ts           # handleError() — normalizes all errors → ActionResponse for server actions
│   ├── result.ts              # Result<T, E> class (ok/fail/fromPromise)
│   ├── logger.ts              # pino logger
│   └── utils.ts               # cn() utility (clsx + tailwind-merge)
├── constants/
│   ├── api-routes.ts          # API route path constants
│   └── routes.ts              # frontend route path constants
├── types/                     # shared TypeScript types
├── hooks/                     # shared React hooks
└── context/                   # React context providers
```

### Data Flow (Page → API)

```
Page (app/.../page.tsx)
  → Feature Service (features/*/api/*.service.ts)
    → api client (lib/api/client/index.ts) — injects Bearer token, 401 retry
      → NestJS backend (API_BASE_URL)
```

### Error Flow

```
NestJS returns { success: false, error: { code, message } }
  → api client throws ApiError(status, code, message)
    → Feature Service wraps in Result.fail() via Result.fromPromise()
      → Server Action checks result.isFailure → calls handleError(error)
        → returns ActionResponse { success: false, error: { message, code, details } }
```

### Auth Architecture

- **Login:** POST `/auth/login` with `platform: "WEB"` → gets `accessToken` in body + `refreshToken` as HttpOnly cookie. Access token stored in-memory (`tokenStore`).
- **Silent refresh:** On 401, `request()` calls `acquireFreshToken()` which implements a **mutex lock** — only one refresh fires, other requests queue. On success, token is stored and all queued requests replay.
- **Forced logout:** When refresh token is also invalid (`REFRESH_TOKEN_INVALID`), `triggerForcedLogout()` clears token and calls the registered handler (should redirect to `/login`). Register via `onForcedLogout()` in root layout.
- **Credentials:** All API requests use `credentials: "include"` so the HttpOnly refresh cookie is always sent.

### Route Groups

- `(public)` — accessible without auth
- `(auth)` — login page, redirects if already authenticated
- `(student)` — requires `role = STUDENT`, IDOR protection (all queries scoped to `jwt.sub`)
- `(admin)` — requires `role = ORGANIZER`

### Path Alias

`@/*` → `./src/*`

## Key Patterns

1. **Server Actions** (`"use server"`) live in `features/*/api/*.action.ts`. They validate input with Zod, delegate to the feature service, call `handleError()` on failure, and `revalidatePath()` on success.

2. **Feature Services** wrap API calls in `Result.fromPromise(api.xxx(...))`. Never throw to UI components.

3. **handleError()** converts `ApiError | Error | unknown` → `ActionResponse<null>` with structured error shape `{ success: false, error: { message, code, details } }`.

4. **Widgets** use nouns (never verbs), follow `[Domain][Context]Widget` naming, and are dumb orchestrators that receive all data as props — they never fetch.

5. **Components** in `src/components/` are stateless entity representations. No API calls, no server actions, no feature-specific logic.

6. **Features cannot import other features.** Compose them together in widgets or pages.

## Tech Stack

- Next.js 16 (App Router, React 19, Turbopack)
- Tailwind CSS v4 + `tw-animate-css`
- shadcn/ui (radix-ui primitives)
- `class-variance-authority` + `clsx` + `tailwind-merge`
- pino logger (structured logging)
- React Compiler (babel-plugin-react-compiler enabled)
