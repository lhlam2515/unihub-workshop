# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in the Expo mobile app.

## Run, Build, Lint

```sh
pnpm dev           # expo start
pnpm android       # expo start --android
pnpm ios           # expo start --ios
pnpm web           # expo start --web
pnpm lint          # expo lint
pnpm lint:fix      # expo lint --fix
pnpm format        # prettier --write src/**/*.{ts,tsx}
```

## Architecture: Offline-First Check-in App

This app is **exclusively for Check-in Staff**. It must function reliably with unreliable WiFi at workshop venues. Students and Organizers use the Web Portal.

### Directory Map

```
src/
├── app/                        # Expo Router (file-based routing)
│   ├── _layout.tsx             # root layout (providers, auth gate)
│   ├── index.tsx               # redirect to login or home
│   ├── login.tsx               # login screen (SCR-M01)
│   ├── (tabs)/                 # bottom tab navigator
│   │   ├── _layout.tsx         # tab bar config (Sự kiện, Hàng đợi, Hồ sơ)
│   │   ├── index.tsx           # HomeScreen — assigned workshops list (SCR-M02)
│   │   ├── queue.tsx           # OfflineQueueScreen — pending sync records (SCR-M06)
│   │   └── profile.tsx         # ProfileScreen — account & settings (SCR-M08)
│   ├── workshop/               # workshop check-in stack
│   │   ├── [id]/index.tsx      # WorkshopDashboardScreen — real-time stats (SCR-M03)
│   │   ├── [id]/scan.tsx       # QRScannerScreen — camera viewfinder (SCR-M04)
│   │   └── [id]/result.tsx     # CheckinResultScreen — scan outcome (SCR-M05)
│   └── sync/                   # offline sync stack
│       └── progress.tsx        # SyncProgressScreen — batch sync with progress (SCR-M07)
├── database/                   # local SQLite (expo-sqlite + Drizzle ORM)
│   ├── client.ts               # drizzle client instance
│   ├── provider.tsx            # React context provider
│   ├── schema/                 # local table schemas
│   │   ├── cached-tickets.schema.ts   # pre-loaded active tickets
│   │   ├── checkin-queue.schema.ts    # offline check-in records (PENDING/SYNCED/CONFLICT)
│   │   ├── app-session.schema.ts      # persisted auth state
│   │   ├── cache-metadata.schema.ts   # sync metadata (lastSyncedAt, workshopId)
│   │   └── sync-log.schema.ts         # batch sync audit trail
│   └── migrations/             # drizzle-kit migrations for local SQLite
├── features/                   # feature-sliced modules (same pattern as web)
├── lib/
│   ├── api/
│   │   ├── client/             # HTTP client — mirrors web but with key differences
│   │   │   ├── index.ts        # api.get/post/put/patch/delete, login(), logout()
│   │   │   ├── http.ts         # request() with Bearer + 401 retry
│   │   │   ├── auth-session.ts # acquireFreshToken() with offline-aware logic
│   │   │   ├── token-store.ts  # hybrid: in-memory cache + expo-secure-store persistence
│   │   │   ├── offline-auth.ts # offline JWT validation (exp check against local time)
│   │   │   └── config.ts       # API_BASE_URL
│   │   ├── errors.ts           # ApiError class + type predicates
│   │   └── types.ts            # ApiResponse, PaginatedData, etc.
│   ├── handlers/
│   │   └── error.ts            # handleError()
│   ├── result.ts               # Result<T, E> class
│   ├── logger.ts               # logger
│   └── utils.ts                # cn(), formatters
├── components/                 # shared UI components (themed-text, themed-view, ui primitives)
├── constants/                  # api-routes, routes, theme
├── hooks/                      # useColorScheme, useThemeColor
├── context/                    # React context providers
└── types/                      # shared TypeScript types
```

### Auth Architecture (Mobile-Specific)

Key differences from the Web app:

- **Both tokens in response body** — login returns `accessToken` + `refreshToken` (no HttpOnly cookies on mobile). Both stored in hybrid cache: in-memory for fast access + `expo-secure-store` (Keychain/Keystore) for persistence.
- **Access Token: 8 hours** (vs 15min on Web) — designed to cover an entire check-in shift without refresh.
- **Auto-refresh on 401** — Same mutex pattern as web, but `acquireFreshToken()` reads the refresh token from `tokenStore.getRefreshToken()` (backed by SecureStore) instead of relying on cookies.
- **Offline JWT validation** — `offline-auth.ts` checks `exp` locally against device time before allowing offline check-in operations. Staff must have logged in online first.

No `onForcedLogout()` callback pattern — uses `expo-router`'s `router.replace('/login')` directly.

### Offline-First Data Flow

```
[Online — Before Event]
  Check-in Staff taps "Đồng bộ danh sách"
    → GET /api/v1/checkin/workshops/{id}/tickets?status=ACTIVE
      → stores in local SQLite (cached_tickets table)
        → REPLACE strategy (deletes old cache, inserts fresh)

[Offline — During Event]
  Camera scans QR → extracts qr_token
    → validates JWl exp locally (offline-auth.ts)
      → looks up qr_token in cached_tickets (SQLite)
        → if found + not already in queue: INSERT into checkin_queue (status=PENDING)
          → displays green success screen

[Online — After Event / When Connectivity Returns]
  Taps "Đồng bộ" or auto-detects connectivity
    → reads all PENDING records from checkin_queue
      → POST /api/v1/checkin/sync (batch)
        → server uses INSERT ON CONFLICT (ticket_id, workshop_id) DO NOTHING
          → updates local records: SYNCED or CONFLICT
            → navigates to SyncProgressScreen with summary
```

### Local SQLite Schema

| Table | Purpose |
|-------|---------|
| `cached_tickets` | Pre-loaded active tickets: `qr_token`, `ticket_id`, `student_name`, `student_code`, `workshop_id` |
| `checkin_queue` | Offline check-in records: `local_id`, `qr_token`, `workshop_id`, `checked_in_at`, `device_id`, `sync_status` (PENDING/SYNCED/CONFLICT) |
| `app_session` | Persisted auth: `user_id`, `role`, `access_token_exp`, `workshop_ids[]` |
| `cache_metadata` | Sync state: `workshop_id`, `last_synced_at`, `ticket_count` |
| `sync_log` | Audit trail: `batch_id`, `synced_count`, `conflict_count`, `completed_at` |

### Path Alias

`@/*` → `./src/*`

## Key Patterns

1. **Pre-load before event** — Staff must download active tickets to SQLite while online. This is a full REPLACE (not merge) to avoid stale VOID tickets persisting locally.

2. **Offline validation chain** — JWT exp check → `allowed_workshop_ids` check → SQLite qr_token lookup → duplicate queue check. All local, no server round-trip.

3. **Idempotent sync** — Same batch can be sent multiple times safely. Server uses `ON CONFLICT DO NOTHING`. Local records track `sync_status` to avoid re-sending already-synced records.

4. **Hybrid token storage** — `tokenStore` writes to both in-memory cache (fast reads) and `expo-secure-store` (survives app restart). On app launch, tokens are restored from SecureStore.

5. **Same Result pattern as web** — Feature services wrap API calls in `Result.fromPromise()`. Server actions/hooks check `result.isFailure` and call `handleError()`.

## Tech Stack

- Expo SDK 54 + Expo Router 6 (file-based routing)
- React Native 0.81 + React 19.1
- NativeWind 4 (Tailwind CSS v3 via `react-native-css-interop`)
- Drizzle ORM + expo-sqlite (local database)
- expo-secure-store (Keychain/Keystore for tokens)
- expo-camera / expo-barcode-scanner (QR scanning)
- react-native-reanimated + react-native-gesture-handler
- @react-navigation/bottom-tabs
- jwt-decode (client-side JWT parsing)
