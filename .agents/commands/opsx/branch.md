---
name: "OPSX: Branch"
description: Create a feature branch for the current change following Conventional Commits convention
category: Workflow
tags: [workflow, git, branch]
---

Create a git branch for the current change, named after the change with a Conventional Commits prefix.

The branch isolates implementation work from `main` and enables multiple in-progress changes to coexist.

**Input**: Change name (kebab-case), e.g., `/opsx:branch implement-iam-module`. If omitted, infer from the active change in `openspec/changes/`.

---

**Steps**

1. **Determine the change name**

   If provided: use it directly.
   If omitted: run `openspec list --json` to find active changes. If more than one, prompt user.

2. **Derive branch prefix**

   Read `openspec/changes/<name>/proposal.md` to determine the change type. Map to prefix:

   | Change type | Prefix | Example |
   |-------------|--------|---------|
   | New feature, capability | `feat/` | `feat/implement-iam-module` |
   | Bug fix | `fix/` | `fix/registration-race-condition` |
   | Maintenance, tooling, docs | `chore/` | `chore/update-spec-driven-workflow` |
   | Urgent production fix | `hotfix/` | `hotfix/critical-security-patch` |
   | Restructuring, no behavior change | `refactor/` | `refactor/consolidate-auth-guards` |

   If proposal.md is not available or the type is unclear, use `feat/` as the default.

3. **Construct and create the branch**

   ```bash
   git checkout -b <prefix>/<change-name>
   ```

   **Validation before creation:**
   - `git status` is clean (stash or commit pending changes first)
   - Branch does NOT already exist locally; if it does, prompt:
     - Checkout existing branch
     - Create with a date suffix: `<prefix>/<change-name>-YYYYMMDD`
     - Cancel
   - Current branch is `main` (rebase from main if not)

4. **Report result**

   ```
   ## Branch Created

   **Branch:** feat/implement-iam-module
   **Base:** main
   **Status:** Switched. Ready for `/opsx:apply`.
   ```

**Guardrails**
- Never create a branch without confirming the change name first (if ambiguous)
- Never create a branch if the working tree is dirty — ask user to commit or stash
- Never use `main` as the branch name — all implementation work MUST be on a feature branch
- If the change name is `kebab-case`, preserve it as-is in the branch name
- If `.openspec.yaml` is missing, warn: "No OpenSpec change artifacts found. Creating branch anyway?"
