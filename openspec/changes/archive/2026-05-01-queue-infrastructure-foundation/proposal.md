# Proposal: Queue Infrastructure Foundation

## Summary

Set up the shared BullMQ queue infrastructure that all async processing depends on. Create a `SharedQueueModule` with queue name constants, typed event contracts, and BullMQ registration — then wire it into the existing `BackgroundModule`.

## Motivation

- The `@nestjs/bullmq` and `bullmq` packages are already in `package.json` but **completely unconfigured** — no connection setup, no queue registration, no shared module.
- Three workers (`NotificationWorker`, `AiSummaryWorker`, `StudentSyncWorker`) exist with TODO stubs that reference queue names as string literals.
- The `shared/queues/` directory referenced in `CLAUDE.md` does not exist.
- Every downstream worktree (W2 Payment Processing, W3 Notification Dispatch, W5 CSV Sync, W6 AI Summary, W7 Integration) depends on this foundation being in place.

## Scope

**In scope:**

| # | Artifact | Purpose |
|---|----------|---------|
| 1 | `shared/queues/queue.constants.ts` | Queue name constants (`notification`, `ai-summary`, `student-sync`) + default job options |
| 2 | `shared/queues/event-contracts.ts` | Typed interfaces for all cross-module event payloads |
| 3 | `shared/queues/queue.module.ts` | `SharedQueueModule` — BullMQ `forRootAsync` + `registerQueue` for all queues |
| 4 | `shared/queues/index.ts` | Barrel re-export |

**In scope (modify):**

| File | Change |
|------|--------|
| `background/background.module.ts` | Add `SharedQueueModule` to `imports`; remove stale TODO comments |

**Intentionally excluded:**
- Worker implementation (deferred to W3, W5, W6)
- Cron job implementation (deferred to W4)
- `AppModule` wiring (deferred to W7 — cross-module integration)
- Payment/workshop notification producers (deferred to W2, W7)

## Approach

1. **Constants first** — define queue names and default job options in a single source of truth
2. **Contracts second** — TypeScript interfaces for every event payload that flows through queues
3. **Module third** — `SharedQueueModule` using `BullModule.forRootAsync` with `REDIS_URL` (same connection as `RedisService`)
4. **Wire last** — import `SharedQueueModule` in `BackgroundModule`, remove TODO comments
5. **No new database schemas** — this change is pure infrastructure (no migrations needed)

## Success Criteria

- [ ] `pnpm check-types` passes for the server
- [ ] `pnpm build` passes for the server  
- [ ] `pnpm lint` passes for the server
- [ ] `SharedQueueModule` compiles and registers all 3 queues
- [ ] BackgroundModule imports SharedQueueModule without circular dependencies
- [ ] Event contract types align with existing database enum values
