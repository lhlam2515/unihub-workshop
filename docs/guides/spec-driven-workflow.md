# Spec-Driven Development Workflow — Guideline

> **Audience:** Developers and AI agents working in the UniHub monorepo.
> **Prerequisites:** OpenSpec CLI installed (`openspec --version`), Node.js >= 18, pnpm >= 9.

## 1. Overview

Spec-Driven Development inverts the traditional "code first, document later" cycle. Before writing a single line of code, you define **what** to build (`proposal`), **how** to build it (`design`), the **acceptance criteria** (`specs`), and the **step-by-step plan** (`tasks`). Only then do you implement (`apply`), verify (`verify`), commit (`commit`), and archive (`archive`).

```
Specification Phase                  Implementation Phase
───────────────────                  ────────────────────
/propose  →  [explore]  →  /apply  →  /verify  →  /commit  →  /archive  →  /pr
```

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

### `/opsx:propose` — Create Change Artifacts

**When:** Starting any new feature, fix, or refactor.

**Input:** Change name (kebab-case) or description of what to build.

**What happens:**

1. `openspec new change "<name>"` scaffolds the directory
2. `openspec status --change "<name>" --json` returns artifact dependency graph
3. Artifacts are created in order: `proposal` → `design` → `specs` → `tasks`
4. For each artifact: `openspec instructions <id> --change "<name>" --json` provides template + rules + context
5. Dependencies are read for context; template is filled in
6. Stops when all `applyRequires` artifacts are `done`

**Output:** Change directory with all 4 artifacts, ready for `/opsx:apply`.

**Example:**

```
/opsx:propose implement-auth-guards
```

### `/opsx:apply` — Implement Tasks

**When:** Artifacts are ready; you want to execute the implementation.

**Input:** Change name (optional — inferred from context if only one active).

**What happens:**

1. `openspec status --change "<name>" --json` confirms artifacts
2. `openspec instructions apply --change "<name>" --json` returns task list + context files
3. Context files (proposal, design, specs, tasks) are read
4. Each pending task is executed in order
5. After each task: `- [ ]` → `- [x]` in tasks.md
6. Pauses on: unclear tasks, design issues, blockers, errors

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
4. Verifies task completion matches file changes
5. Reports any gaps or inconsistencies

**Common issues caught:**

- ESLint boundary violations (`shared` importing from `database`, etc.)
- Missing type augmentations (Express `request.user`)
- Incorrect ioredis parameter ordering
- Uninitialized class properties (missing `!` assertion)
- Module import issues (missing `@Injectable()`, missing module wiring)

### `/opsx:commit` — Generate Git Commits

**When:** Implementation is verified; ready to commit.

**Input:** Change name (optional).

**What happens:**

1. Reads completed tasks from `tasks.md`
2. Runs `git status --porcelain` and `git diff --stat`
3. Groups changed files by task group + architectural layer
4. Drafts Conventional Commit messages (`feat(scope):`, `docs(scope):`, `chore(openspec):`, `build(deps):`)
5. Stages and commits each group in dependency order
6. Skips verification-only tasks (no code changes)

**Commit type mapping:**

| Task pattern | Commit type |
|-------------|-------------|
| "Define type", "Add interface" | `feat(types):` |
| "Implement guard/service/mechanic" | `feat(<module>):` |
| "Update JSDoc", "Translate docs" | `docs(<area>):` |
| "Add dependency", "Install package" | `build(deps):` |
| OpenSpec artifacts | `chore(openspec):` |
| "Verify build/lint" | skip (no code) |

**Commit message format:**

```
<type>(<scope>): <imperative summary>

- <task description>
- <task description>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

### `/opsx:archive` — Archive & Sync Specs

**When:** All tasks complete, all commits made.

**Input:** Change name (optional).

**What happens:**

1. Checks artifact completion + task completion
2. Assesses delta specs: compares with `openspec/specs/`
3. Prompts: "Sync now (recommended)" vs "Archive without syncing"
4. Syncs delta specs to `openspec/specs/<capability>/spec.md`
5. Moves change to `openspec/changes/archive/YYYY-MM-DD-<name>/`

**Output:** Change archived with complete audit trail.

### `/opsx:pr` — Create Pull Request

**When:** Changes committed and pushed; ready for review.

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

## 5. Full Workflow Example

Below is a real trace from implementing `implement-auth-guards`:

```text
## 1. /opsx:propose implement-auth-guards

> User describes: "cài đặt các Guards và Decorators để triển khai
  xác thực dựa trên tài liệu 03-access-control.md và auth.md"

$ openspec new change "implement-auth-guards"
  ✔ Created change at openspec/changes/implement-auth-guards/

$ openspec status --change "implement-auth-guards" --json
  applyRequires: ["tasks"], artifacts: proposal(ready), design(blocked),
  specs(blocked), tasks(blocked)

Created proposal.md → design.md → specs/auth-guards/spec.md → tasks.md

All artifacts complete!

## 2. /opsx:apply implement-auth-guards

13 tasks, 0 complete

### Task 1.1: Define JwtPayload interface
Created src/shared/types/jwt-payload.ts
✓ Task 1.1 complete

### Task 2.1 + 2.2: Implement JwtAuthGuard
Implemented JwtAuthGuard with JWT verification + Redis blacklist check
✓ Tasks 2.1, 2.2 complete

... (working through tasks 3-6) ...

### Task 5.2: HmacSignatureGuard
Implemented HMAC-SHA256 verification with timing-safe comparison
✓ Task 5.2 complete

### Tasks 6.1-6.4: Update decorator docs
Translated all 4 decorators to English contract-oriented JSDoc
✓ Tasks 6.1-6.4 complete

### Tasks 7.1-7.2: Verification
$ pnpm build --filter=server  → PASS
$ eslint on changed files     → PASS
✓ Tasks 7.1, 7.2 complete

13/13 tasks complete.

## 3. ESLint boundary issue discovered

$ eslint reports: shared/types/jwt-payload.ts — shared → database not allowed

Fix: Inline UserRole as string union type ("STUDENT" | "ORGANIZER" | "CHECKIN_STAFF")
instead of importing from database/types/enums.types.

$ pnpm build --filter=server → PASS
$ eslint                     → PASS

## 4. /opsx:commit

✓ abc1234 feat(types): add JwtPayload and Express request augmentation
✓ def5678 feat(guards): implement JwtAuthGuard and RolesGuard
✓ ghi9012 docs(decorators): translate JSDoc to English
✓ jkl0123 build(deps): add jsonwebtoken and @types/jsonwebtoken

4 commits created.

## 5. /opsx:archive implement-auth-guards

Delta spec: auth-guards (new capability, 6 requirements, 18 scenarios)
→ Sync now (recommended)

$ cp specs/auth-guards/spec.md → openspec/specs/auth-guards/spec.md
$ mv openspec/changes/implement-auth-guards → archive/2026-04-29-implement-auth-guards

Archived. Synced.

## 6. /opsx:pr

$ gh pr create --title "feat(core): implement Redis module and auth security layer"
  --body "..."

PR created: https://github.com/lhlam2515/unihub-workshop/pull/6
```

## 6. Verification Checklist

Before archiving any change, verify:

- [ ] `pnpm build` passes with zero errors
- [ ] `tsc --noEmit` passes on all changed files
- [ ] `pnpm lint` passes on changed files
- [ ] ESLint `boundaries` rules are not violated
- [ ] All JSDoc is in English and follows contract-oriented format
- [ ] No sensitive files (.env, credentials) are staged
