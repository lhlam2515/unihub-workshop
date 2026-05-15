# Web RSC + Composition Patterns — Design Spec

**Date:** 2026-05-15  
**Scope:** `apps/web` only — NestJS backend unchanged  
**Approach:** Option B — RSC-First + Composition Patterns (Slot + Compound)

---

## Problem Statement

The current `apps/web` codebase has three structural issues:

1. **All pages are `"use client"`** — data fetching via `useEffect` + `useState`, bypassing Next.js 16 RSC capabilities entirely
2. **Prop drilling in Widgets** — `WorkshopListWidget` accepts 9 props; widgets are tightly coupled to data shape
3. **`"use client"` boundary too high** — entities like `WorkshopCard` are client components despite having no interactivity

These cause unnecessary client-side JS, poor initial load performance, and brittle component contracts.

---

## Architecture Overview

```
proxy.ts (route protection)
  ↓
RSC Page (async Server Component)
  → getServerSession() — React.cache(), 1 /auth/refresh per render
  → serverFetch<T>() — Bearer token injected server-side
  ↓
Widget (Server Component, Slot pattern)
  → header slot, filters slot (← "use client" leaf), empty slot, children
  ↓
Entity Components (Server Components, Compound pattern)
  → WorkshopCard.Header, WorkshopCard.Meta, WorkshopCard.Footer
  → "use client" only at interactive leaves: RegisterButton, forms, dialogs
  ↓
Server Actions (mutations)
  "use server" → getServerSession → Zod validate → service → revalidatePath()
```

---

## Section 1 — Server-Side Auth Layer

### 1.1 `src/proxy.ts` (replaces `middleware.ts`)

Next.js 16 renames `middleware.ts` → `proxy.ts`, export `middleware` → `proxy`. Runtime is `nodejs` only (edge runtime NOT supported in proxy).

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import ROUTES from '@/constants/routes'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const refreshToken = request.cookies.get('refreshToken')?.value

  if (!refreshToken) {
    const loginUrl = pathname.startsWith('/admin')
      ? ROUTES.ADMIN_LOGIN
      : ROUTES.LOGIN
    return NextResponse.redirect(new URL(loginUrl, request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Negative lookahead excludes /admin/login from protection
  matcher: ['/admin/((?!login).*)', '/me/:path*'],
}
```

**Responsibility:** Cookie existence check only. Does not decode JWT or verify roles — that is the page's responsibility via `getServerSession()`.

### 1.2 `src/lib/auth/server-session.ts`

```ts
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { User } from '@/types/auth'

export type ServerSession = {
  user: User
  accessToken: string
}

export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const jar = await cookies()
  const refreshToken = jar.get('refreshToken')?.value
  if (!refreshToken) return null

  try {
    const res = await fetch(`${process.env.API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `refreshToken=${refreshToken}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const { data } = await res.json()
    return { user: data.user, accessToken: data.accessToken }
  } catch {
    return null
  }
})
```

**Key:** `React.cache()` deduplicates calls within a single server render pass — if 5 Server Components on the same page call `getServerSession()`, only **1** request hits `/auth/refresh`.

### 1.3 `src/lib/api/server.ts`

Server-side counterpart of `lib/api/client/http.ts`. Does not use `tokenStore` (browser-only).

```ts
import { ApiError } from '@/lib/api/errors'

export async function serverFetch<T>(
  path: string,
  accessToken: string,
  opts?: RequestInit
): Promise<T> {
  const res = await fetch(`${process.env.API_BASE_URL}${path}`, {
    ...opts,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...opts?.headers,
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  return parseServerResponse<T>(res)
}

async function parseServerResponse<T>(res: Response): Promise<T> {
  const envelope = await res.json()
  if (!envelope.success) throw new ApiError(res.status, envelope.error)
  return envelope.data as T
}
```

---

## Section 2 — RSC Pages

All `app/**/page.tsx` files convert from `"use client"` + `useEffect` to async Server Components.

### Pattern: Public route (no auth)

```tsx
// app/(public)/workshops/page.tsx
import { getPublishedWorkshops } from '@/features/workshop-browsing/api/catalog.service'

export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; hasSeats?: string; sort?: string; q?: string }>
}) {
  const params = await searchParams
  const result = await getPublishedWorkshops(params)
  const workshops = result.isFailure ? [] : result.data.items

  return (
    <WorkshopListWidget
      filters={<WorkshopFilters initialParams={params} />}
      empty={<EmptyState icon={CalendarFold} message="Chưa có workshop nào" />}
    >
      {workshops.map((w) => (
        <WorkshopCard key={w.id} workshop={w}>
          <WorkshopCard.Header title={w.title} status={w.status} />
          <WorkshopCard.Meta startsAt={w.startsAt} location={w.room?.name} />
          <WorkshopCard.Footer price={w.price} seats={w.seatsAvailable} />
        </WorkshopCard>
      ))}
    </WorkshopListWidget>
  )
}
```

### Pattern: Authenticated route

```tsx
// app/(admin)/admin/workshops/page.tsx
import { getServerSession } from '@/lib/auth/server-session'
import { redirect } from 'next/navigation'
import ROUTES from '@/constants/routes'

export default async function AdminWorkshopsPage() {
  const session = await getServerSession()
  if (!session) redirect(ROUTES.ADMIN_LOGIN)

  const workshops = await getAdminWorkshops(session.accessToken)

  return (
    <AdminWorkshopListWidget
      header={<PageHeader title="Workshops" />}
      actions={<CreateWorkshopButton />}
    >
      {workshops.map((w) => (
        <WorkshopCard key={w.id} workshop={w}>
          <WorkshopCard.Header title={w.title} status={w.status} />
        </WorkshopCard>
      ))}
    </AdminWorkshopListWidget>
  )
}
```

### `loading.tsx` — Suspense boundaries

Each route segment gets a `loading.tsx` that replaces `ContentLoader` in `useEffect` patterns:

```tsx
// app/(public)/workshops/loading.tsx
import { ContentLoader } from '@/components/ContentLoader'
export default function Loading() {
  return <ContentLoader layout="grid" count={6} />
}
```

---

## Section 3 — Composition Patterns

### 3.1 Slot Pattern — Widgets

Widgets become **pure layout Server Components** accepting named React node slots. No state, no data fetching.

```ts
interface WorkshopListWidgetProps {
  header?: React.ReactNode    // e.g. <PageHeader />
  filters?: React.ReactNode   // "use client" leaf — search/sort/filter UI
  empty?: React.ReactNode     // empty state
  actions?: React.ReactNode   // CTA buttons
  children: React.ReactNode   // list items
}

// Widget is a plain Server Component
export function WorkshopListWidget({ header, filters, empty, actions, children }: WorkshopListWidgetProps) {
  const isEmpty = !React.Children.count(children)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">{header}{actions}</div>
      {filters}
      {isEmpty ? empty : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>}
    </div>
  )
}
```

**Rule:** If a Widget needs client state (e.g. active filter), that state lives inside the slot component, not the widget itself.

### 3.2 Compound Components — Entities

Sub-components receive props directly (no React context) → compatible with Server Components.

```ts
// components/cards/WorkshopCard.tsx — NO "use client"

function WorkshopCardRoot({ children }: { children: React.ReactNode }) {
  return <Card data-testid="workshop-card">{children}</Card>
}

function Header({ title, status }: { title: string; status: WorkshopStatus }) {
  return (
    <CardHeader>
      <CardTitle className="truncate">{title}</CardTitle>
      <StatusBadge status={status} />
    </CardHeader>
  )
}

function Meta({ startsAt, endsAt, location, speakerName }: MetaProps) { ... }

function Footer({ price, seats, children }: FooterProps) {
  return (
    <CardContent className="flex items-center justify-between">
      <PriceBadge price={price} />
      <SeatsBadge seats={seats} />
      {children}  {/* slot for RegisterButton etc. */}
    </CardContent>
  )
}

export const WorkshopCard = Object.assign(WorkshopCardRoot, { Header, Meta, Footer })
```

**Rule:** When a sub-component needs client interactivity (e.g. `RegisterButton`), pass it as `children` into the Footer slot — it remains an isolated `"use client"` leaf.

### 3.3 Client Boundary Strategy

| Component type | Directive | Reason |
|---|---|---|
| Pages, layouts | none (Server) | async data fetching |
| Widgets | none (Server) | layout containers, slot pattern |
| `WorkshopCard`, `MetricTile`, `StatusBadge` | none (Server) | pure display |
| `WorkshopFilters`, `RegistrationFilters` | `"use client"` | search state, URL params |
| `WorkshopForm`, `RoomForm`, `SpeakerForm` | `"use client"` | form state, useActionState |
| `RegisterButton`, `DeleteButton`, `PublishButton` | `"use client"` | onClick handlers |
| Dialogs, modals | `"use client"` | open/close state |
| `AuthProvider` | `"use client"` | context provider, logout handler |

---

## Section 4 — Server Actions

### Pattern

```ts
// features/admin-workshop-management/api/create-workshop.action.ts
'use server'

import { z } from 'zod'
import { getServerSession } from '@/lib/auth/server-session'
import { revalidatePath } from 'next/cache'
import { handleError } from '@/lib/handlers/error'
import ROUTES from '@/constants/routes'
import { createWorkshop } from './workshop-admin.service'

export async function createWorkshopAction(
  _prev: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  const session = await getServerSession()
  if (!session) return { success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }

  const parsed = CreateWorkshopSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { success: false, error: { message: 'Validation failed', details: parsed.error.flatten() } }
  }

  const result = await createWorkshop(parsed.data, session.accessToken)
  if (result.isFailure) return handleError(result.error)

  revalidatePath(ROUTES.ADMIN_WORKSHOPS)
  return { success: true }
}
```

### Service signature update

Feature services add `accessToken` parameter:

```ts
// features/admin-workshop-management/api/workshop-admin.service.ts
export async function createWorkshop(
  data: WorkshopCreateRequest,
  accessToken: string
): Promise<Result<WorkshopAdmin>> {
  return Result.fromPromise(
    serverFetch<WorkshopAdmin>('/admin/workshops', accessToken, {
      method: 'POST',
      body: data,
    })
  )
}
```

### Form wires to action via `useActionState` (React 19)

```tsx
// "use client"
const [state, action, isPending] = useActionState(createWorkshopAction, null)
return <form action={action}>...</form>
```

---

## File Delta Summary

### New files (~15)

| File | Purpose |
|---|---|
| `src/proxy.ts` | Route protection (Next.js 16 convention) |
| `src/lib/auth/server-session.ts` | `getServerSession()` with `React.cache()` |
| `src/lib/api/server.ts` | `serverFetch<T>()` — server-side API wrapper |
| `src/app/**/loading.tsx` × ~13 | Auto Suspense per route segment |
| `src/features/*/api/*.action.ts` × ~12 | Server Actions for create/update/delete |

### Modified files (~24)

| Group | Change |
|---|---|
| `app/**/page.tsx` × ~14 | Remove `"use client"` + `useEffect` → async RSC |
| `widgets/*.tsx` × ~10 | Remove `"use client"` → slot pattern props |
| `components/cards/WorkshopCard.tsx` | Compound sub-components, remove `"use client"` |
| `features/*/api/*.service.ts` × ~8 | Add `accessToken` param, switch to `serverFetch` |

### Removed files (~3)

| File | Reason |
|---|---|
| `src/hooks/use-async-query.ts` | Replaced by RSC async/await |
| `src/components/PageLoader.tsx` | Replaced by `loading.tsx` |
| `"use client"` + loading state in pages | Replaced by `loading.tsx` + Suspense |

### Unchanged

- `src/lib/api/client/` — kept for login/logout flows
- `src/context/auth-context.tsx` — kept for client-side user state (navbar, logout)
- `apps/server/` — zero backend changes

---

## Constraints & Decisions

1. **`proxy.ts` runtime is nodejs only** — edge runtime not supported in Next.js 16 proxy convention. Do not configure `export const runtime = 'edge'`.

2. **`React.cache()` scope** — deduplication is per-request (per RSC render pass), not across requests. No persistent caching of access tokens.

3. **`getServerSession()` returns null silently** — pages are responsible for redirecting. `proxy.ts` only checks cookie existence; role validation is in the page.

4. **Client-side auth flow unchanged** — `AuthProvider` + `tokenStore` + `onForcedLogout` remain for the client-side UX (navbar user display, forced logout on 401 from client components).

5. **`WorkshopFilters` stays `"use client"`** — URL-based filtering requires `useRouter` + `useSearchParams`. The filter component manages its own state and updates the URL; the page re-renders server-side on navigation.

6. **Compound component sub-components use direct props, not context** — avoids forcing `"use client"` on the entire compound tree. Context-based compounds only justified for complex client-only components (multi-step forms, dialogs).
