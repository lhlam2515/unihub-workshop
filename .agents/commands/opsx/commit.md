---
name: "OPSX: Commit"
description: Generate git commits from completed OpenSpec tasks
category: Workflow
tags: [workflow, git, experimental]
model: sonnet
effort: medium
---

Generate staged git commits from completed OpenSpec tasks.

**Input**: Optionally specify a change name (e.g., `/opsx:commit add-auth`). If omitted, infer from conversation context or select the most recent active change.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from the most recent `/opsx:apply` or `/opsx:archive`
   - Run `ls openspec/changes/` to list active changes if ambiguous
   - Use **AskUserQuestion** only if multiple active changes exist with no clear candidate

2. **Read completed tasks**

   Read `openspec/changes/<name>/tasks.md` (or archived path if already archived via `openspec/changes/archive/`).
   Parse all `- [x]` lines — these are completed tasks.

3. **Map tasks to changed files**

   Run `git status --porcelain` and `git diff --stat` to see what was modified.
   Cross-reference task descriptions with file paths to group changes.

   Grouping rules:
   - Tasks in the same `## N.` group → likely belong in one commit
   - If a single task group touches files in different architectural layers (e.g., `shared/` + `core/`), split into separate commits
   - Untracked files (openspec artifacts, new source files) → separate commit

4. **Draft commit messages**

   Use **Conventional Commits** format. Map task group content to type + scope:

   | Task pattern | Commit type | Example scope |
   |-------------|-------------|---------------|
   | "Define type", "Add interface" | `feat(types):` | `jwt-payload` |
   | "Implement guard", "Implement service" | `feat(guards):` / `feat(redis):` | module name |
   | "Update JSDoc", "Translate docs" | `docs(decorators):` | file area |
   | "Add dependency", "Install package" | `build(deps):` | — |
   | OpenSpec artifacts (proposal, specs, archive) | `chore(openspec):` | — |
   | "Verify build", "Check lint" | (skip — verification tasks produce no code) | — |

   **Message format:**
   ```
   <type>(<scope>): <imperative summary from task>

   <task descriptions as bullet points, one per line>
   ```

5. **Stage and commit**

   For each commit group, in dependency order:
   - `git add <files>` — only files related to this commit group
   - `git commit -m "<message>"`
   - Report: `✓ <commit-hash-short> <type>(<scope>): <summary>`

   **Pause before each commit if:**
   - A file appears in multiple commit groups (ambiguous) → ask user which group
   - A pre-commit hook fails → fix and create a NEW commit (never amend)
   - The commit touches sensitive files (.env, credentials) → warn user

6. **Show summary**

   ```
   ## Commits Created

   ✓ abc1234 feat(types): add JwtPayload and UserRole types
   ✓ def5678 feat(guards): implement authentication and authorization guards
   ✓ ghi9012 chore(openspec): archive change-name and sync spec

   3 commits created. Next: git push
   ```

**Commit Message Style Rules**

- Summary line: under 72 characters, imperative mood, sentence case (no period)
- Body: one bullet point per completed task, derived from task description
- Skip verification-only tasks (no code changes to commit)
- Merge multiple trivial related tasks into one bullet point if they modify the same file

**Example**

Tasks:
```
## 1. Shared Types
- [x] 1.1 Define JwtPayload interface
- [x] 1.2 Add Express type augmentation

## 2. Guards Implementation
- [x] 2.1 Implement JwtAuthGuard
- [x] 2.2 Implement RolesGuard
```

Produces two commits:

```sh
git commit -m "feat(types): add JwtPayload and Express request augmentation

- Define JwtPayload interface with sub, role, jti, allowed_workshop_ids
- Add Express Request.user type augmentation"
```

```sh
git commit -m "feat(guards): implement JwtAuthGuard and RolesGuard

- Implement JWT verification with Redis blacklist checking
- Implement RBAC authorization via @Roles() metadata"
```

**Guardrails**
- Never commit sensitive files (.env, credentials, secrets)
- If a task group is unclear, ask before committing
- Respect the user's conventional commit style from the repo's git history
- If no change specified and multiple active changes exist, ask the user
- If no completed tasks found, report and stop
- If git working tree is clean, report and stop
