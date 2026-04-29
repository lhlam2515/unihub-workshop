---
name: "OPSX: PR"
description: Create a pull request from commit and spec history on the current branch
category: Workflow
tags: [workflow, git, experimental]
---

Create a structured pull request from the commit history and OpenSpec changes on the current branch.

**Input**: None required. The command infers everything from the current branch and its history.

**Steps**

1. **Gather branch context**

   ```bash
   git branch --show-current
   git log main..HEAD --oneline
   git diff main..HEAD --stat
   ```

   Determine:
   - Current branch name
   - Number of commits ahead of main
   - Files changed (grouped by architectural layer)

2. **Gather OpenSpec context**

   ```bash
   ls openspec/changes/archive/       # recently archived changes
   ls openspec/specs/                 # synced specs
   ```

   For each archived change whose files appear in the diff:
   - Read `proposal.md` for the "what" and "why"
   - Count the completed tasks from `tasks.md`
   - Note the capability names from `specs/`

   For each spec synced to `openspec/specs/` that appears in the diff:
   - Read the spec to count requirements and scenarios
   - Note the capability name

3. **Draft PR title**

   Follow **Conventional Commits** format. Derive the type + scope from the dominant commit type:

   | Dominant commit type | PR title format |
   |---------------------|-----------------|
   | `feat(scope):` | `feat(scope): <summary of new capability>` |
   | `fix(scope):` | `fix(scope): <summary of fix>` |
   | Mixed `feat` + `docs` + `chore` | `feat(core): <overarching theme>` |

   **Rules:**
   - Under 72 characters
   - If multiple scopes, use the broadest applicable scope (e.g., `core` for Redis + guards)
   - Summarize the overarching theme, not a laundry list

4. **Draft PR body**

   Use this structure:

   ```markdown
   ## Summary

   <2-4 bullet points, each one sentence describing a completed capability or major change>

   ## What Changed

   <table with areas and files, grouped by architectural layer>

   | Area | Files |
   |------|-------|
   | <area> | <file paths> |

   ## Specs

   <table of specs synced or archived>

   | Spec | Requirements | Scenarios |
   |------|-------------|-----------|
   | `<capability>` | N | M |

   ## Verification

   <bulleted list of verification steps completed>

   ---
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

   **Section rules:**
   - **Summary**: Derive from proposal.md "What Changes" sections. One bullet per capability.
   - **What Changed**: Group files by architectural layer (`core/`, `shared/`, `database/`, `modules/<name>/`, `openspec/`). Show file paths relative to repo root.
   - **Specs**: Only include if delta specs were synced. Read spec.md to count `### Requirement:` and `#### Scenario:` lines.
   - **Verification**: Extract from tasks.md "Verification" section. Include build status, lint status, DI resolution checks.

5. **Create the PR**

   Use the GitHub MCP `create_pull_request` tool:

   ```
   mcp__github__create_pull_request({
     owner: "<from git remote>",
     repo: "<from git remote>",
     head: "<current branch>",
     base: "main",
     title: "<drafted title>",
     body: "<drafted body>"
   })
   ```

   If `gh` CLI is available, fall back to:
   ```bash
   gh pr create --title "<title>" --body "<body>"
   ```

6. **Show result**

   ```
   ## PR Created

   **URL:** https://github.com/<owner>/<repo>/pull/<number>
   **Title:** <title>
   **Branch:** <head> → main
   **Specs:** N specs synced | **Commits:** M commits
   ```

**PR Body Example**

```markdown
## Summary

- **Redis infrastructure** — RedisService with 11 primitive operations, JSON helpers, lifecycle hooks, and global module wiring
- **Auth guards** — JwtAuthGuard, RolesGuard, WorkshopScopeGuard, and HmacSignatureGuard with full JSDoc documentation
- **Shared types** — JwtPayload interface, UserRole union, Express Request augmentation

## What Changed

| Area | Files |
|------|-------|
| Redis | `shared/redis/redis.service.ts`, `shared/redis/redis.module.ts`, `app.module.ts` |
| Guards | `core/guards/jwt-auth.guard.ts`, `roles.guard.ts`, `workshop-scope.guard.ts`, `hmac-signature.guard.ts` |
| Decorators | `shared/decorators/public.decorator.ts`, `roles.decorator.ts`, `current-user.decorator.ts`, `idempotency-key.decorator.ts` |
| Types | `shared/types/jwt-payload.ts`, `shared/types/express.d.ts` |
| OpenSpec | `specs/redis-infrastructure/`, `specs/auth-guards/`, `changes/archive/` |

## Specs

| Spec | Requirements | Scenarios |
|------|-------------|-----------|
| `redis-infrastructure` | 8 | 18 |
| `auth-guards` | 6 | 18 |

## Verification

- `pnpm build --filter=server` passes with zero TypeScript errors
- ESLint passes on all changed files
- All guards resolve dependencies via NestJS DI in 14 controllers across 5 modules

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Guardrails**
- Always use the current branch as `head` and `main` as `base`
- If no commits ahead of main, report and stop
- If the branch has already been pushed and a PR exists, show the existing PR URL
- Never include sensitive information (tokens, passwords, internal URLs) in the PR body
- If the branch has no OpenSpec changes, still create the PR using only commit history
- If `gh` CLI is not available and GitHub MCP is not configured, output the drafted title/body for manual use
- Verify `git remote` is configured before attempting PR creation
