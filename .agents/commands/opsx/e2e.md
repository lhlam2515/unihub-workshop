---
name: "OPSX: E2E"
description: Run the full spec-driven development cycle from explore to PR
category: Workflow
tags: [workflow, pipeline, e2e, full-cycle]
---

Run the complete spec-driven development workflow as a guided pipeline. Chains all steps from exploration through pull request, pausing at checkpoints that require your input.

```
/explore → /propose → /branch → /apply ⇄ /verify → /archive → /docs → /commit → /pr
```

**Input:** Change name (kebab-case), or omit to start from exploration.

---

## Configuration Strategy

The pipeline auto-applies optimal model and effort settings per phase. Commands with frontmatter overrides (branch, archive, commit, pr, verify) run with their own config automatically. The rest inherit from your session default (`opusplan` + `xhigh` recommended).

| Source | Phase | Model | Effort |
|--------|-------|-------|--------|
| Session default | explore, propose, apply, docs | `opusplan` | `xhigh` |
| Frontmatter | branch | `haiku` | `low` |
| Frontmatter | verify | `sonnet` | `high` |
| Frontmatter | archive | `haiku` | `low` |
| Frontmatter | commit | `sonnet` | `medium` |
| Frontmatter | pr | `sonnet` | `medium` |

For heavy phases (propose, schema/service implementation, docs), consider adding **ultrathink** to your prompt for one-off deep reasoning.

See `docs/guides/claude-code-config.md` for full details.

**Steps**

1. **Parse input and initialize state**

   If change name provided:
   ```bash
   openspec status --change "<name>" --json 2>/dev/null
   ```
   If the change already exists, detect the current phase from artifact + task completion:
   - No artifacts → at explore phase
   - `applyRequires` artifacts not done → at propose phase
   - No branch → at branch phase
   - Tasks incomplete → at apply phase
   - Unverified → at verify phase
   - Not archived → at archive phase
   - No JSDoc → at docs phase
   - Uncommitted → at commit phase
   - No PR → at pr phase

   Report the current phase and offer to resume or restart.

2. **Phase detection matrix**

   | Phase | Detected When |
   |-------|---------------|
   | explore | No change directory exists |
   | propose | Change dir exists, `applyRequires` artifacts missing |
   | branch | Artifacts done, no branch detected |
   | apply | Tasks have `- [ ]` remaining |
   | verify | All tasks `[x]` but `/opsx:verify` not yet run |
   | archive | Change dir not in `archive/` |
   | docs | Source files missing JSDoc on public methods |
   | commit | `git status` shows uncommitted changes |
   | pr | No PR exists for current branch |

3. **Run each phase sequentially**

   For each phase from current to completion:

   **explore phase** — `/opsx:explore <name>`
   - **Config:** session default (`opusplan` + `xhigh`)
   - Read spec docs from `docs/` and `docs/blueprint/`
   - Ask: "What do you want to build or investigate?"
   - Present findings and offer to proceed to propose
   - **Checkpoint: pause after findings, wait for your confirmation**

   **propose phase** — `/opsx:propose <name>`
   - **Config:** session default (`opusplan` + `xhigh`). Add **ultrathink** to prompt for deep artifact reasoning
   - Create change: `openspec new change "<name>"`
   - Loop through artifacts in dependency order:
     - Read deps, generate artifact, mark done
   - Stop when all `applyRequires` artifacts are done
   - Show summary: specs, requirements, scenarios
   - **Checkpoint: pause with artifact summary, wait for your confirmation**

   **branch phase** — `/opsx:branch <name>`
   - **Config:** auto — `haiku` + `low` (from frontmatter)
   - Infer prefix from proposal scope
   - Create branch: `git checkout -b <prefix>/<name>`
   - Verify branch is not main
   - **Checkpoint: show branch name, wait for your confirmation**

   **apply phase** — `/opsx:apply <name>`
   - **Config:** session default (`opusplan` + `xhigh`). For schema + service tasks, add **ultrathink**. For build debugging, switch to `/model opus` + `/effort max`
   - Read tasks.md, identify independent task groups
   - **Ask: "Run parallel subagents for independent groups?"**
   - If yes: distribute to parallel worktrees, merge after completion
   - If no: execute tasks sequentially
   - After each task: `- [ ]` → `- [x]` in tasks.md
   - After each task group: build + lint check
   - **On build failure: pause, report errors, fix, continue**
   - **On unclear task: pause, ask for clarification**
   - Loop until all tasks `[x]`, build passes, lint clean

   **verify phase** — `/opsx:verify <name>`
   - **Config:** auto — `sonnet` + `high` (from frontmatter)
   - Run TypeScript check, lint
   - Cross-reference implementation against spec scenarios
   - Report three dimensions: Completeness, Correctness, Coherence
   - List any new findings discovered
   - **Checkpoint: show report, ask "Ready for archive?"**
   - If issues found: offer to return to apply phase

   **archive phase** — `/opsx:archive <name>`
   - **Config:** auto — `haiku` + `low` (from frontmatter)
   - Check artifact + task completion
   - Assess delta specs
   - **Checkpoint: "Sync now or skip?"**
   - Sync specs if requested
   - Archive change to `openspec/changes/archive/YYYY-MM-DD-<name>/`

   **docs phase** — `/opsx:docs <name>`
   - **Config:** session default (`opusplan` + `xhigh`). Add **ultrathink** to prompt for context-aware JSDoc
   - Read spec artifacts for business context
   - Read documentation rules (`.agents/rules/documentation.md`)
   - Collect target files from tasks.md + git diff
   - For each file, generate layer-specific JSDoc
   - **Auto-run (no checkpoint needed)** — documentation is mechanical

   **commit phase** — `/opsx:commit <name>`
   - **Config:** auto — `sonnet` + `medium` (from frontmatter)
   - Read completed tasks, check git status
   - Group files by task dependency order
   - Draft commit plan with messages
   - **Checkpoint: show commit plan, ask "Commit as planned?"**
   - Stage and commit each group in dependency order

   **pr phase** — `/opsx:pr`
   - **Config:** auto — `sonnet` + `medium` (from frontmatter)
   - Gather commit history + OpenSpec context
   - Draft PR title and structured body
   - **Checkpoint: show draft, ask "Create PR?"**
   - Create PR via `gh pr create`

4. **Show final summary**

   ```
   ## E2E Complete: <change-name>

   ### Pipeline Summary
   | Phase | Duration | Status |
   |-------|----------|--------|
   | explore | 5m | ✓ Done |
   | propose | 10m | ✓ Done |
   | branch  | 1m | ✓ Done |
   | apply   | 45m | ✓ Done (33 tasks) |
   | verify  | 5m | ✓ Done (all clear) |
   | archive | 2m | ✓ Done (4 specs synced) |
   | docs    | 8m | ✓ Done (12 files) |
   | commit  | 5m | ✓ Done (7 commits) |
   | pr      | 3m | ✓ Done (#8) |

   **Total:** ~84 minutes
   **PR:** https://github.com/<owner>/<repo>/pull/<number>
   ```

**Resume support**

If the pipeline is interrupted (e.g., build fails during apply), re-run `/opsx:e2e <name>` to resume from the current phase. The phase detection logic identifies where you left off.

```
$ /opsx:e2e implement-iam-module
  Change exists, branch exists, 12/33 tasks complete.
  Resuming from apply phase (task 13).
```

**Guardrails**

- Never commit directly on main — branch creation is mandatory
- Every checkpoint pauses and waits for your confirmation — no silent progression
- On build/lint failure in apply phase: always pause, never auto-fix without showing the error
- If change doesn't exist when running with a name, start from explore phase
- If no name provided and no change exists, prompt: "Describe what you want to build"
- If a phase's command has its own guardrails (e.g., commit never stages sensitive files), those still apply
- Co-Authored-By trailer is only added by `/opsx:commit`, not by this command itself

**Checkpoint behavior**

Each checkpoint shows:
```
═══ Checkpoint: <phase name> ═══

<current state summary>

[Proceed to next phase?] (Y/n)
```

Your options at any checkpoint:
- `Y` or Enter — continue to next phase
- `n` — stop pipeline, you inspect and manually continue later
- Describe changes — e.g., "fix this issue first" pauses and returns control to you
