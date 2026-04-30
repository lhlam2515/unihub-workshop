# Spec-Driven Development Workflow — Guideline

> **Audience:** Developers and AI agents working in the UniHub monorepo.
> **Prerequisites:** OpenSpec CLI installed (`openspec --version`), Node.js >= 18, pnpm >= 9.

## 1. Overview

Spec-Driven Development inverts the traditional "code first, document later" cycle. Before writing a single line of code, you define **what** to build (`proposal`), **how** to build it (`design`), the **acceptance criteria** (`specs`), and the **step-by-step plan** (`tasks`). Only then do you implement and close the cycle.

```
Exploration     Specification         Implementation              Closure
───────────     ─────────────         ──────────────              ───────
/explore   →    /propose         →    /branch             →     /archive
                  │                     ↓                           ↓
                  │                /apply (sequential)          /docs
                  │                     ↓                           ↓
                  │                  /verify                    /commit
                  │                     ↓                           ↓
                  └── model switch ──> archive               →    /pr
```

The workflow is iterative: during `/apply`, you may loop back to `/verify` to catch issues early, then continue applying.

### Model Switching & Cache

Each phase requires different model/effort settings. The pipeline prompts you at checkpoints to switch:

| Phase | Model | Effort | Reason |
|-------|-------|--------|--------|
| explore → apply → docs | `opusplan` | `xhigh` | Deep reasoning for artifacts and code |
| branch → archive | `haiku` | `low` | Mechanical operations |
| verify → commit → pr | `sonnet` | `medium`/`high` | Pattern matching, drafting |

Every `/model` switch clears the prompt cache (next turn ~10x more expensive). This is acceptable at phase boundaries because long phases (propose, apply, docs) exceed the 5-minute cache TTL naturally. **Never switch mid-phase** — use `ultrathink` or `/effort max` instead.

See `claude-code-config.md` for full analysis. Use `/opsx:e2e` to run the complete pipeline with guided checkpoints.

### Branching Strategy

Every change MUST be implemented on its own branch, created before any code is written. The branch name follows the Conventional Commits prefix convention:

```
{feat,fix,chore,hotfix,refactor}/<change-name-kebab-case>
```

| Prefix | When |
|--------|------|
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `chore/` | Maintenance, tooling, documentation |
| `hotfix/` | Urgent production fix (branched from release tag, not main) |
| `refactor/` | Code restructuring with no behavior change |

Examples:

- `feat/implement-iam-module`
- `fix/registration-race-condition`
- `chore/update-spec-driven-workflow`
- `refactor/consolidate-auth-guards`

The branch is created right after `/opsx:propose` and before `/opsx:apply`. This keeps the main branch clean and allows multiple in-progress changes to coexist.

## 2. Directory Layout

```
openspec/
├── config.yaml              # schema: spec-driven
├── specs/                   # main (synced) specs — source of truth
│   └── <capability>/
│       └── spec.md
├── changes/                 # active changes
│   └── <change-name>/
│       ├── .openspec.yaml
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── specs/           # delta specs (to be synced on archive)
└── changes/archive/         # completed changes
    └── YYYY-MM-DD-<name>/
```

## 3. Artifact Reference

| # | Artifact | Purpose | Key Question |
|---|----------|---------|--------------|
| 1 | `proposal.md` | Motivate the change | **Why?** What problem? What capabilities? |
| 2 | `design.md` | Technical decisions | **How?** Architecture, trade-offs, risks? |
| 3 | `specs/*/spec.md` | Acceptance criteria | **What exactly?** Requirements + scenarios? |
| 4 | `tasks.md` | Implementation plan | **In what order?** Verifiable checklist? |

### 3.1 Proposal (`proposal.md`)

Sections:

- **Why** — 1-2 sentences. The problem or opportunity. Why now?
- **What Changes** — bullet list. New capabilities, modifications, removals. Mark breaking changes with `**BREAKING**`.
- **Capabilities** — map to `specs/<name>/spec.md` files. New vs Modified.
- **Impact** — affected code, APIs, dependencies.

### 3.2 Design (`design.md`)

Create only when the change involves: cross-cutting concerns, new dependencies, security/perf complexity, or ambiguity.

Sections:

- **Context** — current state, constraints
- **Goals / Non-Goals** — scope boundaries
- **Decisions** — technical choices with rationale and alternatives considered
- **Risks / Trade-offs** — `[Risk] → Mitigation` format

### 3.3 Specs (`specs/<capability>/spec.md`)

Each capability from the proposal gets one spec file.

Format:

```markdown
## ADDED Requirements

### Requirement: <name>
<description with SHALL/MUST>

#### Scenario: <name>
- **WHEN** <condition>
- **THEN** <expected outcome>
```

Rules:

- Scenarios MUST use exactly 4 hashtags (`####`)
- Every requirement MUST have at least one scenario
- Use SHALL/MUST for normative requirements
- Delta operations: `## ADDED`, `## MODIFIED`, `## REMOVED`, `## RENAMED`

### 3.4 Tasks (`tasks.md`)

Checklist format. The apply phase parses `- [ ]` / `- [x]` to track progress.

```markdown
## 1. <Task Group>

- [ ] 1.1 <Task description>
- [ ] 1.2 <Task description>
```

Rules:

- Group tasks under `## N.` numbered headings
- Order by dependency
- Each task must be verifiable (you know when it's done)
- Verification tasks go last

## 4. Command Reference

### `/opsx:explore` — Explore Requirements

**When:** Starting any new feature, fix, or refactor — before creating artifacts.

**Input:** Description of what to investigate, or just enter explore mode.

**What happens:**

1. Reads existing spec docs (`docs/srs.md`, `docs/blueprint/specs/`, `docs/blueprint/design/`) for business context
2. Reads the active change artifacts if one exists
3. Engages in open-ended investigation: problem space, codebase architecture, integration points
4. May create ASCII diagrams, compare options, surface risks and unknowns
5. When insights crystallize, offers to create a proposal

**Purpose:** This is the discovery phase. No code is written. The goal is to understand the domain and scope before committing to a plan.

**Output:** Clarified requirements, identified risks, ready for `/opsx:propose`.

### `/opsx:propose` — Create Change Artifacts

**When:** Requirements are clear from exploration.

**Input:** Change name (kebab-case) or description of what to build.

**What happens:**

1. `openspec new change "<name>"` scaffolds the directory
2. `openspec status --change "<name>" --json` returns artifact dependency graph
3. Artifacts are created in order: `proposal` → `design` → `specs` → `tasks`
4. For each artifact: `openspec instructions <id> --change "<name>" --json` provides template + rules + context
5. Dependencies are read for context; template is filled in
6. Stops when all `applyRequires` artifacts are `done`

**Output:** Change directory with all 4 artifacts, ready for `/opsx:branch`.

**Example:**

```
/opsx:propose implement-iam-module
```

### `/opsx:branch` — Create Implementation Branch

**When:** Artifacts are complete, before writing any code.

**Input:** Change name (kebab-case) or explicit branch name.

**What happens:**

1. Derives branch name from the change name using the Conventional Commits prefix convention:

   ```bash
   # From proposal scope, determine the prefix:
   #   feat/  — new capability
   #   fix/   — bug fix
   #   chore/ — maintenance, tooling, docs
   #   hotfix/ — urgent production fix
   #   refactor/ — restructuring with no behavior change

   git checkout -b <prefix>/<change-name>
   ```

2. If the change name doesn't clearly map to a prefix (e.g., `implement-iam-module` → `feat/`), infer from the proposal's content.

3. If a branch with that name already exists, prompt user: checkout existing, rename, or create with a date suffix.

**Validation:**

- Branch is NOT `main` — all implementation work happens on feature branches
- Branch name matches `{feat,fix,chore,hotfix,refactor}/<kebab-case-name>`
- `git status` is clean before branching (stash or commit pending changes)

**Output:** A new local branch, switched and ready for `/opsx:apply`.

**Examples:**

```
/opsx:branch implement-iam-module
→ git checkout -b feat/implement-iam-module

/opsx:branch fix-registration-race-condition
→ git checkout -b fix/registration-race-condition
```

### `/opsx:apply` — Implement Tasks

**When:** Branch is created, artifacts are ready; you want to execute the implementation.

**Input:** Change name (optional — inferred from context if only one active).

**What happens:**

1. `openspec status --change "<name>" --json` confirms artifacts
2. `openspec instructions apply --change "<name>" --json` returns task list + context files
3. Context files (proposal, design, specs, tasks) are read
4. Tasks are executed **sequentially** in dependency order
5. After each task: `- [ ]` → `- [x]` in tasks.md
6. After each task group: `pnpm build --filter=server` + lint
7. **On build failure:** pauses, reports errors, asks "fix or review first?" before proceeding
8. Pauses on: unclear tasks, design issues, blockers, errors
9. Between large task groups (schema→DTOs, repos→services), suggests `/compact` to compress context

**Critical rules during apply:**

- Keep changes minimal and scoped to each task
- Run `pnpm build --filter=server` after each group of changes
- Run `tsc --noEmit` to catch TypeScript errors early
- Run `eslint` on changed files to verify boundary/lint compliance
- If a pre-commit hook fails: **fix and create a NEW commit** (never amend)

**Output:** All tasks marked `[x]`, build passing, lint clean.

### `/opsx:verify` — Verify Implementation Quality

**When:** After `/opsx:apply`, before `/opsx:archive`.

**What happens:**

1. `tsc --noEmit` — TypeScript type checking
2. `pnpm lint --filter=server` — ESLint on changed files
3. Cross-references implementation against spec scenarios
4. Checks each requirement from delta specs against codebase for implementation evidence
5. Verifies task completion matches file changes
6. Reports three dimensions: **Completeness** (tasks, coverage), **Correctness** (requirements, scenarios), **Coherence** (design adherence, patterns)
7. Discovers **new findings** during verification: error patterns, missing edge cases, architectural insights

**Common issues caught:**

- ESLint boundary violations (`shared` importing from `database`, etc.)
- Missing type augmentations (Express `request.user`)
- Incorrect ioredis parameter ordering
- Uninitialized class properties (missing `!` assertion)
- Module import issues (missing `@Injectable()`, missing module wiring)
- Incorrect `Result` method calls (e.g., `.propagate()` vs `Result.fail()`)
- Enum type mismatches in Drizzle `eq()` queries

### `/opsx:archive` — Archive & Sync Specs

**When:** Implementation verified, ready to close the change.

**Input:** Change name (optional).

**What happens:**

1. Checks artifact completion + task completion
2. Assesses delta specs: compares with `openspec/specs/`
3. Prompts: "Sync now (recommended)" vs "Archive without syncing"
4. Syncs delta specs to `openspec/specs/<capability>/spec.md`
5. Moves change to `openspec/changes/archive/YYYY-MM-DD-<name>/`

**Output:** Change archived with complete audit trail.

### `/opsx:docs` — Generate Contract-Oriented JSDoc

**When:** After archive, before commit. The code is final, now document its contract.

**Before starting:** Switch to `opusplan` + `xhigh` (archive phase runs on `haiku`). See `claude-code-config.md`.

**Input:** Change name, file paths, or module path.

**What happens:**

1. Pre-scans target files for JSDoc gaps using awk (skips files already fully documented)
2. Reads spec artifacts (specs, proposal, design) for business context
3. Reads project documentation rules (`.agents/rules/documentation.md`)
4. Collects target files from tasks.md + git diff
5. Classifies files by architectural layer (controller, service, repository, DTO)
6. For each file, generates layer-specific JSDoc:

   | Layer | Documentation Focus |
   |-------|-------------------|
   | **Service** | Business rules, side effects, error codes |
   | **Controller** | HTTP contract, security, params source |
   | **Repository** | Data access logic, indexes, locking |
   | **DTO / Builder** | Data contract, transformation rules |

7. Each JSDoc block follows the Contract-Oriented format: active-verb summary, domain-meaning `@param`, explicit error codes in `@returns`, side effects and `@throws` sections

**Output:** Only files with JSDoc gaps are updated. All public methods documented with intent-based JSDoc.

### `/opsx:commit` — Generate Git Commits

**When:** Implementation is verified and documented; ready to commit.

**Input:** Change name (optional).

**What happens:**

1. Reads completed tasks from `tasks.md`
2. Runs `git status --porcelain` and `git diff --stat`
3. Groups changed files by **task dependency order** (lowest dependency first)
4. Drafts Conventional Commit messages (`feat(scope):`, `docs(scope):`, `chore(openspec):`, `build(deps):`)
5. Stages and commits each group in dependency order
6. Skips verification-only tasks (no code changes)

**Grouping strategy — commit by task dependency, not architectural layer:**

Commits follow the same order as tasks: schema/types → DTOs → repositories → services → controllers. Each commit groups files that are functionally related within the same task group, even if they span different layers.

```
# Instead of grouping all repos together across tasks:
feat(repositories): implement all repositories          ← BAD: too coarse

# Group by what the task produces:
feat(auth): add user and student types and schemas      ← schema first
feat(auth): implement users and students repositories   ← repos with schema context
feat(auth): add auth service with login/refresh/logout  ← service that uses repos
feat(auth): implement auth controller endpoints          ← controller that uses service
```

**Commit type mapping:**

| Task pattern | Commit type |
|-------------|-------------|
| "Define type", "Add interface" | `feat(types):` |
| "Implement guard/service/mechanic" | `feat(<module>):` |
| "Update JSDoc", "Translate docs" | `docs(<area>):` |
| "Add dependency", "Install package" | `build(deps):` |
| OpenSpec artifacts + command files | `chore(openspec):` |
| "Verify build/lint" | skip (no code) |

**Commit message format:**

```
<type>(<scope>): <imperative summary>

- <task description>
- <task description>
```

### `/opsx:pr` — Create Pull Request

**When:** All changes committed and pushed; ready for review.

**Input:** None (infers from current branch).

**What happens:**

1. Gathers commit history (`git log main..HEAD --oneline`)
2. Gathers OpenSpec context (archived changes + synced specs)
3. Drafts PR title from dominant commit type + overarching theme
4. Drafts structured PR body:
   - **Summary** — 2-4 bullets from proposal
   - **What Changed** — table grouped by architectural layer
   - **Specs** — table with requirement/scenario counts
   - **Verification** — build/lint/DI status
5. Creates PR via GitHub MCP (or `gh pr create`)

## 5. Context & Token Management

As the pipeline progresses, conversation context grows. The `/compact` command compresses context without losing information. Optimal compact points:

| After Phase | Why | Agent Says |
|-------------|-----|-----------|
| propose | Artifacts (5+ files) just created, context inflated | "Run `/compact`, then switch to haiku" |
| apply (schema/DTOs) | Schema types and contracts generated | "Schema done. Run `/compact` before repos" |
| apply (services) | Business logic with error codes and side effects | "Services done. Run `/compact` before controllers" |
| apply (all) | Full implementation in context, preparing verify | "Apply done. Run `/compact` before verify" |
| archive | Clean slate before docs generation | "Archive done. Run `/compact` before docs" |

The agent suggests `/compact` at these points automatically. You can run it anytime you feel context is bloated. Use `/context` to check current token usage.

## 6. Full Workflow Example

Below is a real trace from implementing `implement-iam-module` — a complete IAM (Identity & Access Management) module with authentication, user management, and checkin staff assignment:

```text
## 1. /opsx:explore

> Agent reads: docs/srs.md, docs/blueprint/specs/auth.md, docs/blueprint/design/03-access-control.md
> Identifies 33 tasks across 6 groups with clear dependency chains

Finding: IAM module needs schema, DTOs, repos, services, controllers.
Sequential execution recommended due to cross-group dependencies.

## 2. /opsx:propose implement-iam-module

> User describes: "cài đặt module IAM — auth, user management, checkin staff"

$ openspec new change "implement-iam-module"
  ✔ Created change at openspec/changes/implement-iam-module/

Created proposal.md → design.md → specs/ → tasks.md

4 delta specs synced:
  - token-lifecycle (5 requirements, 14 scenarios)
  - user-authentication (11 requirements, 31 scenarios)
  - user-management (8 requirements, 25 scenarios)
  - staff-assignment (6 requirements, 14 scenarios)

→ Run `/compact` to compress artifact context, then switch to haiku + low

## 3. /opsx:branch implement-iam-module

$ git checkout -b feat/implement-iam-module
  Switched to a new branch 'feat/implement-iam-module'

Branch created from main. Switch back to opusplan + xhigh for apply.

## 4. /opsx:apply implement-iam-module

33 tasks, 0 complete

### Phase A: Schema + Types + DTOs (tasks 1-3)
✓ database schema: checkinStaffAssignments table, relations, types
✓ DTO builders: UserResponseDto, AuthMeResponseDto, LoginResponseDto
→ Compact: "Schema + DTOs done. Run `/compact` before repositories."

### Phase B: Repositories (tasks 4-7)
✓ UsersRepository (5 methods), StudentsRepository (2 methods)
✓ CheckinStaffAssignmentsRepository (2 methods)
→ Build + lint pass.

### Phase C: Core Services (tasks 8-12)
✓ TokenService: sign/verify/blacklist access + refresh tokens
✓ AuthService: login, refreshToken, logout, getMe
→ Compact: "Services done. Run `/compact` before controllers."

### Phase D: Business Services (tasks 13-15)
✓ UsersService: list, getById, updateStatus, revokeTokens
✓ StudentProfileService: getProfileByUserId
✓ CheckinStaffAssignmentService: assignWorkshops, getAssignedWorkshops

### Phase E: Controllers + Wiring (tasks 16-22)
✓ AuthController: POST login, POST refresh, POST logout, GET me
✓ UsersAdminController: GET list, GET byId, PATCH status, POST revoke
✓ CheckinStaffAdminController: POST assign, GET workshops
✓ IamModule wiring + AppModule registration

### Phase F: Build verification (tasks 23-25)

$ pnpm build --filter=server
  12 TypeScript errors found

> Agent: "12 build errors found. Should I fix these or would you like to review first?"
> User: "fix them"

### Fixes applied:
- systemErrors.internal() signature mismatch (12 occurrences)
- Drizzle enum type mismatch in eq() → use sql\`...\`
- Result.propagate() → Result.fail() (type narrowing issue)
- studentProfile type inference with explicit annotation

$ pnpm build --filter=server  → PASS
$ pnpm lint --filter=server    → PASS (0 IAM warnings)

33/33 tasks complete.
→ Compact: "Apply done. Run `/compact` before verification."

## 5. /opsx:verify implement-iam-module

### Summary
| Dimension    | Status                    |
|--------------|---------------------------|
| Completeness | 33/33 tasks, 30 reqs     |
| Correctness  | 30/30 reqs covered        |
| Coherence    | Followed (design.md)      |

### New findings discovered:
- systemErrors.internal() only accepts cause?, not (message, cause)
- Drizzle enum columns need sql\`\` not eq() for string comparison
- Result<T>.isFailure is a boolean getter, not type predicate — can't narrow
- LoginResponseBuilder must use LoginResponseDto return type (snake_case)

Final assessment: All critical issues resolved. Ready for archive.

## 6. /opsx:archive implement-iam-module

4 delta specs to sync:
  - token-lifecycle → openspec/specs/token-lifecycle/spec.md
  - user-authentication → openspec/specs/user-authentication/spec.md
  - user-management → openspec/specs/user-management/spec.md
  - staff-assignment → openspec/specs/staff-assignment/spec.md

→ Sync now

$ mv openspec/changes/implement-iam-module → archive/2026-04-30-implement-iam-module

Archived. 4 specs synced.
→ Compact: "Archive done. Run `/compact` before docs. Switch to opusplan + xhigh."

## 7. /opsx:docs implement-iam-module

> Switch to opusplan + xhigh before starting. Docs auto-runs after model switch.

### Documented Files
| File | Methods | Rules | Errors | Effects |
|------|---------|-------|--------|--------|
| auth.service.ts | 4 | 3 | 3 | 5 |
| token.service.ts | 6 | 2 | 4 | 2 |
| users.service.ts | 4 | 1 | 2 | 2 |
| auth.controller.ts | 4 | — | — | — |
| users-admin.controller.ts | 4 | — | — | — |
| checkin-staff.service.ts | 2 | 1 | 1 | 1 |
| ... | 8 more files | | | |

All JSDoc follows Contract-Oriented standard (.agents/rules/documentation.md).

## 8. /opsx:commit

7 commits, ordered by task dependency:

✓ a1b2c3d feat(database): add checkinStaffAssignments schema and relations
✓ e4f5g6h feat(dto): add response DTO builders for auth and user endpoints
✓ i7j8k9l feat(repositories): implement users and students repositories
✓ m0n1o2p feat(auth): implement TokenService and AuthService
✓ q3r4s5t feat(admin): implement UsersService and CheckinStaffAssignmentService
✓ u6v7w8x feat(controllers): wire auth and admin HTTP endpoints
✓ y9z0a1b chore(openspec): sync 4 delta specs and archive IAM change

## 9. /opsx:pr

$ gh pr create --title "feat(iam): implement IAM module with full auth lifecycle"
  --body "..."

PR created: https://github.com/lhlam2515/unihub-workshop/pull/8
```

## 7. Verification Checklist

> **Tip:** Run `/compact` at the recommended points (see Section 5) to keep context manageable, then use `/context` to verify token usage before the final phases.

Before archiving any change, verify:

- [ ] `pnpm build` passes with zero errors
- [ ] `tsc --noEmit` passes on all changed files
- [ ] `pnpm lint` passes on changed files
- [ ] ESLint `boundaries` rules are not violated
- [ ] All JSDoc is in English and follows contract-oriented format
- [ ] No sensitive files (.env, credentials) are staged

### End-to-End Checklist

```
Before code:
  ☐ /opsx:explore       — Requirements clarified from spec docs
  ☐ /opsx:propose        — All 4 artifacts created (proposal, design, specs, tasks)
  ☐ /opsx:branch         — Feature branch created from main ({feat,fix,chore}/<name>)

Implementation:
  ☐ /opsx:apply          — Tasks implemented, build + lint pass
  ☐ (loop) /opsx:verify  — Matches specs; issues fixed before continuing

Closure:
  ☐ /opsx:archive        — Change archived, delta specs synced
  ☐ /opsx:docs           — Contract-Oriented JSDoc generated

Version control:
  ☐ /opsx:commit         — Commits ordered by task dependency
  ☐ /opsx:pr             — PR created with structured body
```
