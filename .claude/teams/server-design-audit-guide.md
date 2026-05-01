# Agent Team Guide: `server-design-audit`

## Prerequisites

```bash
# 1. Verify Claude Code version
claude --version   # Must be v2.1.32 or later

# 2. Enable agent teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# 3. Pre-approve file operations to avoid permission prompt spam
# Add to ~/.claude/settings.json or .claude/settings.local.json:
# {
#   "permissions": {
#     "allow": ["Bash(git:*)"]
#   }
# }
```

---

## Team Overview

| Field | Value |
|-------|-------|
| **Goal** | Audit toàn diện server NestJS dựa trên 4 nguồn tài liệu thiết kế, tìm và sửa lỗi, bổ sung test |
| **Teammates** | 3: `spec-verifier`, `arch-sec-reviewer`, `test-writer` + Lead |
| **Est. token cost** | ~4-5x single session |
| **Plan approval** | Required — mọi thay đổi code cần plan được duyệt trước |
| **Expected duration** | ~20-35 phút (2 pha: Audit → Fix) |
| **Mandatory references** | `openspec/specs/`, `docs/srs.md`, `docs/blueprint/design/`, `docs/openapi.yaml` |

---

## Lead's Opening Prompt

_Copy toàn bộ block dưới đây và paste vào Claude Code để khởi động team._

```
[AGENT TEAM REQUEST]

Goal: Kiểm thử toàn diện server NestJS tại apps/server/ (161 files, ~16,500 LOC, 5 modules)
để xác minh implementation khớp với 4 nguồn tài liệu thiết kế, phát hiện và sửa lỗi thiết kế,
đồng thời bổ sung unit + integration + e2e tests.

MANDATORY: Mọi teammate PHẢI dùng 4 nguồn tài liệu sau làm reference trong suốt quá trình làm việc:
- openspec/specs/ (25 capability specs)
- docs/srs.md (50 FRs + 42 BRs + Traceability Matrix + NFRs)
- docs/blueprint/design/ (6 architecture documents: 01-architecture, 02-storage-strategy,
  03-access-control, 04-safety-mechanisms, 05-adr-decisions, 06-api-design)
- docs/openapi.yaml (API contract: endpoints, schemas, error codes, security schemes)

---

TEAM LEAD (you, using Opus model):

Your responsibilities:
1. Spawn 3 teammates with the configurations below.
2. Create a task list breaking down the work for each teammate.
3. After spawning, assign initial tasks and let them run in parallel.
4. When ALL 3 teammates report completion of Phase 1 (audit), synthesize their findings
   into ONE consolidated audit report at apps/server/docs/audit-report.md.
5. Create GitHub issues for each finding (grouped by severity: Critical/High/Medium/Low).
6. Present the consolidated report + fix plan to the user for approval.
7. After user approves, assign fix tasks to teammates (Phase 2) with explicit plan-approval
   requirements for each code change.
8. After all fixes are done, verify the 3 PRs are ready and present to user.
9. Clean up the team: shut down all teammates.

Do NOT begin synthesis until you have received explicit completion messages from
ALL 3 teammates: spec-verifier, arch-sec-reviewer, test-writer.

Audit report format:
- Executive summary (total findings by severity)
- Section 1: Spec Compliance (from spec-verifier)
- Section 2: Architecture & Security (from arch-sec-reviewer)
- Section 3: Test Coverage (from test-writer)
- Appendix: Full finding list with file:line + spec reference

---

TEAMMATE 1: spec-verifier
- Role: Đối chiếu implementation với tất cả functional requirements và business rules
- Model: claude-sonnet
- Require plan approval before any code changes

- MANDATORY REFERENCES (must read before starting):
  * docs/srs.md — ALL 50 FRs across F01-F10 + 42 BRs + Traceability Matrix (Section 5)
  * openspec/specs/ — ALL 25 capability specs in openspec/specs/*/spec.md
  * docs/openapi.yaml — ALL endpoints, request/response schemas, ErrorCode enum
  * .agents/rules/naming-convention.md — naming rules for cross-checking

- Exclusive scope (may read + write for fixes):
  * apps/server/src/modules/*/services/
  * apps/server/src/modules/*/controllers/
  * apps/server/src/modules/*/repositories/
  * apps/server/src/modules/*/dto/
  * apps/server/src/database/schema/ (read-only)

- Must NOT touch:
  * apps/server/src/core/ (guards, filters, interceptors)
  * apps/server/src/shared/ (Result type, Redis, queues)
  * Any *.spec.ts or test/ files
  * .agents/rules/layered-architecture.md

- Task (Phase 1 — AUDIT):
  1. Read ALL 50 FRs in docs/srs.md (F01-001 through F10-005). For EACH FR,
     verify the Acceptance Criteria are implemented in the codebase.
  2. Read ALL 42 BRs. For EACH BR, verify the business rule is enforced in code.
  3. Read ALL 25 capability specs in openspec/specs/. Cross-reference with implementation.
  4. Read docs/openapi.yaml. Verify every endpoint exists as a controller route,
     every ErrorCode in the enum is produced by the corresponding error factory in shared/.
  5. Check that DTO schemas match the OpenAPI request/response shapes.
  6. Check database schema (Drizzle) matches the entities defined in openapi.yaml.
  7. Check naming convention compliance for services, controllers, repositories, DTOs.

- When done (Phase 1): Send a message to the Lead containing:
  * Total FRs checked, how many pass/fail
  * Total BRs checked, how many pass/fail
  * Total specs checked, how many pass/fail
  * Every finding with: severity (Critical/High/Medium/Low), file:line, the specific
    FR/BR/spec clause violated, and a one-line description
  * Example: "CRITICAL | src/modules/booking/services/registrations.service.ts:142 |
    BR-018 violated: DECR result < 0 does not trigger INCR rollback"

- Task (Phase 2 — FIX, after user approves plan):
  Execute the approved fixes for spec compliance issues in your scope.
  Create PR #1 with title "fix: spec compliance corrections" containing all your changes.

---

TEAMMATE 2: arch-sec-reviewer
- Role: Audit kiến trúc (layered rules, module wiring, cross-module communication)
  và bảo mật (JWT, RBAC, IDOR, circuit breaker, rate limiting, HMAC)
- Model: claude-sonnet
- Require plan approval before any code changes

- MANDATORY REFERENCES (must read before starting):
  * docs/blueprint/design/01-architecture.md — C4 model, module boundaries
  * docs/blueprint/design/02-storage-strategy.md — PostgreSQL + Redis + S3 hybrid
  * docs/blueprint/design/03-access-control.md — RBAC, Dual-Token, Scope, IDOR
  * docs/blueprint/design/04-safety-mechanisms.md — Rate limiting, Circuit Breaker, Idempotency
  * docs/blueprint/design/05-adr-decisions.md — Architecture Decision Records
  * docs/blueprint/design/06-api-design.md — RESTful API design decisions
  * docs/srs.md — Section 6.4 NFR targets (Performance <300ms, TLS 1.2+, AOF persistence)
  * docs/openapi.yaml — security schemes (BearerAuth, HmacSignature), error responses
  * .agents/rules/layered-architecture.md — strict layered rules
  * .agents/rules/naming-convention.md — naming compliance for core/shared classes

- Exclusive scope (may read + write for fixes):
  * apps/server/src/core/ (guards: jwt-auth, roles, workshop-scope, hmac-signature;
    filters: global-exception; interceptors: response; config: cors, logger)
  * apps/server/src/shared/ (Result type, error factories, Redis, queues, decorators, storage)
  * apps/server/src/modules/*/ (cross-cutting only: module wiring, guard usage,
    inter-module imports, service-to-service communication patterns)
  * apps/server/src/database/schema/ (read-only: CHECK constraints, unique indexes,
    partial indexes, foreign keys)

- Must NOT touch:
  * apps/server/src/modules/*/dto/ (spec-verifier's domain)
  * Any *.spec.ts or test/ files
  * Business logic inside services (spec-verifier's domain)

- Task (Phase 1 — AUDIT):
  1. Module wiring audit: Check AppModule imports all 5 business modules. Verify
     cross-module dependencies match the architecture design (service→service only,
     no repository→repository).
  2. Layered architecture audit: Verify controllers are thin (no business logic),
     services never throw (always return Result), repositories wrap Drizzle in tryCatch.
     Check for any circular imports or layer violations.
  3. Guards audit: Verify JwtAuthGuard checks Redis blacklist. Verify RolesGuard
     enforces RBAC per endpoint. Verify WorkshopScopeGuard enforces allowed_workshop_ids.
     Verify HmacSignatureGuard exists and is used on webhook endpoints.
  4. IDOR audit: Verify EVERY student-facing query includes WHERE student_id = jwt.sub.
     Check that student_id from URL/body is ignored for STUDENT role.
  5. Safety mechanisms audit: Verify Token Bucket rate limiter uses correct Redis keys.
     Verify CircuitBreakerMechanic implements CLOSED→OPEN→HALF_OPEN→CLOSED per BR-025.
     Verify IdempotencyMechanic implements SET NX (Layer 1) + DB unique (Layer 2).
     Verify SeatLockMechanic implements SET NX with TTL=900s.
  6. Response interceptor audit: Verify it maps OkResult→200/201 and FailResult→appropriate
     HTTP status codes. Verify GlobalExceptionFilter catches all unhandled errors.
  7. NFR audit: Check if any endpoint violates the <300ms performance target (look for
     blocking calls, missing async/await). Verify Redis AOF configuration.
  8. Naming convention audit: Verify all core/shared classes follow naming rules
     (Controller/Service/Repository/Mechanic suffixes, kebab-case files).

- When done (Phase 1): Send a message to the Lead containing:
  * Total checks performed, how many pass/fail by category
  * Every finding with: severity (Critical/High/Medium/Low), file:line, the specific
    blueprint/ADR/rule clause violated, and a one-line description
  * Example: "HIGH | apps/server/src/modules/checkin/checkin.module.ts:5 |
    Missing CatalogModule import per 01-architecture.md cross-module dependency diagram"

- Task (Phase 2 — FIX, after user approves plan):
  Execute the approved fixes for architecture/security issues in your scope.
  Create PR #2 with title "fix: architecture and security corrections" containing all your changes.

---

TEAMMATE 3: test-writer
- Role: Viết unit + integration + e2e tests cho server
- Model: claude-sonnet
- Require plan approval before any code changes

- MANDATORY REFERENCES (must read before starting):
  * docs/srs.md — Acceptance Criteria của TỪNG FR để viết test case chính xác
  * docs/openapi.yaml — request/response schemas, status codes, ErrorCode enum
    để viết integration test chính xác
  * docs/blueprint/design/04-safety-mechanisms.md — edge cases cho rate limiting,
    circuit breaker, idempotency, seat locking
  * docs/blueprint/design/03-access-control.md — test cases cho RBAC, scope, IDOR

- Exclusive scope (may write):
  * apps/server/test/ (all test files)
  * apps/server/src/**/*.spec.ts (all unit test files)

- May READ (but NOT write):
  * apps/server/src/modules/ (to understand code being tested)
  * apps/server/src/core/ (to understand guards, filters)
  * apps/server/src/shared/ (to understand Result type, error factories)
  * apps/server/src/database/schema/ (to understand DB structure)

- Must NOT write to:
  * apps/server/src/core/
  * apps/server/src/shared/
  * apps/server/src/modules/ (any implementation code)
  * apps/server/src/database/

- Task (Phase 1 — AUDIT + UNIT TESTS):
  1. Audit current test coverage: find ALL existing *.spec.ts files. Report coverage gaps.
  2. Write unit tests for ALL services that have NO existing tests:
     - iam: auth.service, token.service, users.service, student-profile.service,
       checkin-staff-assignment.service
     - catalog: workshops.service, rooms.service, speakers.service, documents.service,
       seat-counter.service, room-conflict.service, workshop-notification-publisher.service
     - booking: registrations.service, payments.service, payment-gateway.service
     - booking mechanics: seat-lock.mechanic, rate-limiter.mechanic, global-rate-limit.mechanic,
       idempotency.mechanic, circuit-breaker.mechanic
     - checkin: checkin.service, ticket.service, offline-sync.service
     - background: notifications.service, notification-dispatch.service,
       ai-summary.service, student-sync.service, system-monitor.service
  3. Write unit tests for ALL repositories.
  4. Use Jest + mock Drizzle (mockDeep) + mock Redis (ioredis-mock).
  5. Follow Result pattern: test both ok() and fail() paths for every method.
  6. For each test file, reference the specific FR Acceptance Criteria from docs/srs.md
     that the test validates.

- Task (Phase 2 — INTEGRATION + E2E TESTS, after receiving audit reports):
  7. Write integration tests using NestJS Testing utilities (Test.createTestingModule):
     - Test each controller with its real service (mock repository + Redis)
     - Verify guards are applied (JWT, RBAC, Scope)
     - Verify ZodValidationPipe rejects invalid inputs
     - Verify ResponseInterceptor wraps Result correctly
  8. Write e2e tests using supertest for critical flows:
     - Auth flow: login → refresh → logout → blacklist rejection
     - Booking flow: rate limit → DECR seat → registration → payment → ticket issuance
     - Checkin flow: QR validate → checkin record → duplicate rejection
     - Cancel flow: registration cancel → ticket VOID → seat INCR
  9. Write edge case tests based on findings from spec-verifier and arch-sec-reviewer
     (e.g., "the audit found X is broken, add test to prevent regression").

- When done (Phase 1): Send a message to the Lead containing:
  * Coverage report: how many services/repos now have tests vs before
  * List of test files created with the FR Acceptance Criteria they cover
  * Any blockers or areas that couldn't be tested (e.g., external dependencies)

- When done (Phase 2): Send a message to the Lead with the PR #3 ready containing
  ALL test files (unit + integration + e2e).

---

DEPENDENCIES:
- Phase 1: ALL 3 teammates work in PARALLEL. No dependencies.
- Phase 2: test-writer's integration/e2e tests SHOULD incorporate edge cases
  discovered by spec-verifier and arch-sec-reviewer. test-writer can start Phase 2
  integration tests before audit is complete, but should read the audit reports
  for additional edge cases before finalizing.
- Phase 3 (Fix): Only starts after user approves the fix plan.

COMMUNICATION PROTOCOL:
- When a teammate completes Phase 1, send a structured message to the Lead with
  all findings, formatted as described in each teammate's "When done" section.
- When a teammate completes Phase 2/fixes, send a message to the Lead with
  the PR number and summary of changes.
- If a teammate encounters a blocker (missing dependency, unclear spec, etc.),
  immediately message the Lead rather than guessing.
- The Lead should NOT begin synthesis until ALL 3 teammates have reported
  Phase 1 completion.

QUALITY GATES:
- spec-verifier must NOT modify files in src/core/, src/shared/, or test files
- arch-sec-reviewer must NOT modify DTO files (spec-verifier's domain)
- test-writer must NOT modify any implementation code (only test files)
- All teammates MUST reference the 4 mandatory document sources in their reports
- Every finding MUST include file:line and the specific document clause violated
- Lead MUST present the consolidated fix plan to the user BEFORE any code changes
- All code changes require plan approval

FINAL DELIVERABLES:
- apps/server/docs/audit-report.md — consolidated audit report (Lead)
- GitHub issues — one per finding, grouped by severity (Lead)
- PR #1: Spec compliance fixes (spec-verifier)
- PR #2: Architecture/security fixes (arch-sec-reviewer)
- PR #3: Unit + integration + e2e tests (test-writer)

Begin by spawning the 3 teammates and assigning their Phase 1 tasks.
```

---

## Interacting With the Team

### Cycling through teammates (in-process mode)
```
Shift+Down    → cycle to next teammate
Ctrl+T        → toggle shared task list view
Enter         → enter a teammate's session
Escape        → interrupt current turn
```

### Checking task status
Hỏi Lead: `"What is the current status of all tasks?"`

### If a teammate stops or gets stuck
```
Nói với teammate bị kẹt: "You encountered an error on [X].
Please try [alternative approach] and continue."
```

Hoặc hỏi Lead: `"[Teammate name] appears stuck. Please reassign their
remaining tasks to another teammate or spawn a replacement."`

---

## Cleanup

Khi team hoàn tất, luôn dọn dẹp qua Lead:

```
Tell the lead: "Please shut down all teammates and clean up the team."
```

KHÔNG yêu cầu teammates tự dọn dẹp — chỉ Lead mới làm việc này.

---

## Troubleshooting Quick Reference

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Teammates not appearing | Teams not enabled | Check `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` |
| Two teammates edited same file | Scope too broad | Check Scope Boundaries table above |
| Lead finished before teammates | Lead didn't wait | Remind Lead: "Wait for ALL completion messages" |
| Too many permission prompts | Operations not pre-approved | Add Bash(git:*) to settings.json allowlist |
| Teammate stopped on error | Unhandled error state | Message teammate directly with recovery instruction |
| Task status lagging | Teammate forgot to mark complete | Ask Lead to check and update task status |

---

## Scope Boundaries (Quick Reference)

| Teammate | May touch | Must NOT touch |
|----------|-----------|----------------|
| **spec-verifier** | `src/modules/*/services/`, `src/modules/*/controllers/`, `src/modules/*/repositories/`, `src/modules/*/dto/`, `src/database/schema/` (read) | `src/core/`, `src/shared/`, test files |
| **arch-sec-reviewer** | `src/core/`, `src/shared/`, `src/modules/*/` (cross-cutting), `src/database/schema/` (read) | `src/modules/*/dto/`, test files |
| **test-writer** | `apps/server/test/`, `src/**/*.spec.ts`, `src/modules/*/` (read-only) | `src/core/` (write), `src/shared/` (write), `src/database/` (write) |

## Mandatory Reference Map

| Document | spec-verifier | arch-sec-reviewer | test-writer |
|----------|:---:|:---:|:---:|
| `docs/srs.md` (FRs + BRs + NFRs) | Primary | Section 6.4 (NFR) | Acceptance Criteria |
| `openspec/specs/` (25 specs) | Primary | — | — |
| `docs/blueprint/design/` (6 docs) | — | Primary (all 6) | 03-access-control, 04-safety-mechanisms |
| `docs/openapi.yaml` | Endpoints + Schemas + ErrorCode | Security schemes | Request/Response schemas |
| `.agents/rules/layered-architecture.md` | — | Primary | — |
| `.agents/rules/naming-convention.md` | Cross-check | Cross-check | — |

---

_Guide generated by the Claude Code Agent Team Builder skill._
