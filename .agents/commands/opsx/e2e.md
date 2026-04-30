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

## Configuration Guide

Run `/model` and `/effort` before each phase to apply the optimal settings. Commands with frontmatter overrides (branch, archive, commit, pr, verify) declare their ideal config — switch to it before starting that phase. The rest work best with the session default (`opusplan` + `xhigh`).

| Phase | Recommended Model | Recommended Effort | Note |
|-------|-------------------|-------------------|------|
| explore, propose, apply, docs | `opusplan` (default) | `xhigh` (default) | Add **ultrathink** to prompt for heavy artifacts |
| branch | `haiku` | `low` | Trivial — just creating a git branch |
| verify | `sonnet` | `high` | Pattern matching, not deep reasoning |
| archive | `haiku` | `low` | Mechanical file moves |
| commit | `sonnet` | `medium` | Commit message generation |
| pr | `sonnet` | `medium` | PR description from git history |

**How to switch:** At each phase boundary, before calling the phase command, run e.g. `/model haiku` + `/effort low`. The pipeline will prompt you at checkpoints — that's the right moment to switch.

**Cache note:** Every `/model` switch **invalidates the prompt cache** — the next turn pays full price instead of the ~90% cache discount (~10x more). This is **acceptable at phase boundaries** because:

- Long phases (propose 5-10m, apply 20-60m, docs 5-10m) exceed the 5-minute cache TTL naturally — cache would be cold anyway
- Short phases (branch ~1m, archive ~2m) are 1-2 turns — haiku's cheaper rate offsets the single cache miss
- **Never switch mid-phase.** Need deeper reasoning? Use `ultrathink` or `/effort max` instead — no cache invalidation.
- `opusplan` is internal (Opus→Sonnet), does NOT invalidate cache — safe default.

See `docs/guides/claude-code-config.md#8-prompt-caching--model-switching` for full analysis.

See `docs/guides/claude-code-config.md` for full details.

## Phase Quick Reference

| Phase | What Happens | What You Do | Est. | Compact |
|-------|-------------|-------------|------|---------|
| explore | Agent reads specs, asks what to build | Describe your goal | 3-5m | — |
| propose | Agent creates proposal, design, specs, tasks | Review and approve artifacts | 5-10m | ✅ After |
| branch | Agent creates a git branch | Confirm branch name | ~1m | — |
| apply | Agent implements code task by task | Review code, fix build errors when asked | 20-60m | Between groups + After |
| verify | Agent cross-checks code against specs | Review report, approve or request fixes | 3-5m | — |
| archive | Agent syncs specs, archives change dir | Choose sync or skip | ~2m | — |
| docs | Agent adds JSDoc per documentation.md | Switch model before it starts | 5-10m | — |
| commit | Agent stages & commits grouped by task | Review commit plan | 3-5m | — |
| pr | Agent creates PR with structured description | Review and confirm | ~2m | — |

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
   - **Start:** Announce: "Starting **explore** phase. I'll read the spec docs to understand the domain, then present my findings."
   - **Config:** session default (`opusplan` + `xhigh`). No switch needed.
   - Read spec docs from `docs/` and `docs/blueprint/`
   - Ask: "What do you want to build or investigate?"
   - Present findings and offer to proceed to propose
   - **Checkpoint: show findings, wait for your confirmation. Tell user: "Next up: **propose** — I'll create the change artifacts. Review my findings and let me know if you want to proceed."**

   **propose phase** — `/opsx:propose <name>`
   - **Start:** Announce: "Starting **propose** phase. I'll create the change artifacts — proposal, design, specs, and tasks. This takes a few minutes."
   - **Config:** session default. Add **ultrathink** to prompt for deep artifact reasoning.
   - Create change: `openspec new change "<name>"`
   - Loop through artifacts in dependency order:
     - Read deps, generate artifact, mark done
   - Stop when all `applyRequires` artifacts are done
   - Show summary: specs, requirements, scenarios
   - **Checkpoint: show artifact summary, wait for your confirmation. Tell user: "Next up: **branch** — I'll create a git branch. Before that, run `/compact` to compress the artifact context, then switch to haiku + low."**

   **branch phase** — `/opsx:branch <name>`
   - **Start:** Announce: "Starting **branch** phase. I'll create a git branch and verify it's off main."
   - **Config:** run `/model haiku` + `/effort low` (trivial git operation)
   - Infer prefix from proposal scope
   - Create branch: `git checkout -b <prefix>/<name>`
   - Verify branch is not main
   - **Checkpoint: show branch name, wait for your confirmation. Tell user: "Next up: **apply** — I'll implement the tasks. Switch back to opusplan + xhigh before we start."**

   **apply phase** — `/opsx:apply <name>`
   - **Start:** Announce: "Starting **apply** phase. I'll implement the tasks one by one, running build + lint after each group. This is the longest phase — expect 20-60 minutes depending on complexity."
   - **Config:** session default. For schema + service tasks, add **ultrathink**. For build debugging, switch to `/model opus` + `/effort max`.
   - Read tasks.md, execute tasks sequentially in dependency order
   - After each task: `- [ ]` → `- [x]` in tasks.md
   - After each task group: build + lint check
   - **Compact between groups:** At natural boundaries (schema→DTOs, repos→services, services→controllers), suggest: "Task group done. Run `/compact` before the next group." Skip if the group had ≤2 tasks (context growth is small).
   - **On build failure: pause, report errors, then ask: "Should I fix these or would you like to review first?" Only fix after user confirms.**
   - **On unclear task: pause, ask for clarification**
   - Loop until all tasks `[x]`, build passes, lint clean
   - **On completion:** Suggest: "Apply is done. Run `/compact` to reset context before verification."

   **verify phase** — `/opsx:verify <name>`
   - **Start:** Announce: "Starting **verify** phase. I'll cross-check the implementation against the specs and report completeness, correctness, and coherence."
   - **Config:** run `/model sonnet` + `/effort high` (pattern matching, not deep reasoning)
   - Run TypeScript check, lint
   - Cross-reference implementation against spec scenarios
   - Report three dimensions: Completeness, Correctness, Coherence
   - List any new findings discovered
   - **Checkpoint: show report, ask "Ready for archive?" Tell user: "Next up: **archive** — I'll sync specs and archive the change directory. Switch to haiku + low before proceeding."**
   - If issues found: offer to return to apply phase

   **archive phase** — `/opsx:archive <name>`
   - **Start:** Announce: "Starting **archive** phase. I'll check task completion, show you which specs changed, and archive the change directory."
   - **Config:** run `/model haiku` + `/effort low` (mechanical file operations)
   - Check artifact + task completion: `openspec status --change "<name>" --json`
   - Present delta specs summary: which specs changed, how many requirements added/modified
   - **Checkpoint: "Sync delta specs to main spec store now, or skip syncing?" Tell user: "Next up: **docs** — I'll add JSDoc to the implemented files. Before that, switch to **opusplan + xhigh**."**
   - Sync specs if requested
   - Archive change to `openspec/changes/archive/YYYY-MM-DD-<name>/`
   - **On completion:** Suggest: "Archive done. Run `/compact` to clear context before docs generation."

   **docs phase** — `/opsx:docs <name>`
   - **Start:** Announce: "Starting **docs** phase. I'll run the JSDoc generator on the implemented files. First, please switch to the correct model."
   - **Config:** Tell user: "Before I begin docs, please run `/model opusplan` + `/effort xhigh`." Wait for user to confirm model switch, then proceed.
   - Delegates to `/opsx:docs <name>` which follows `docs.md` steps (loads spec artifacts, reads `documentation.md`, pre-scans for gaps, generates layer-specific JSDoc)
   - **Auto-runs (no checkpoint during)** — after model switch confirmed, run without further pauses
   - **On completion:** Announce results. Then: "Next up: **commit** — I'll stage files and draft commits. Switch to sonnet + medium."

   **commit phase** — `/opsx:commit <name>`
   - **Start:** Announce: "Starting **commit** phase. I'll group the changed files by task dependency and draft commit messages."
   - **Config:** run `/model sonnet` + `/effort medium`
   - Read completed tasks, check git status
   - Group files by task dependency order
   - Draft commit plan with messages
   - **Checkpoint: show commit plan, ask "Commit as planned?" Tell user: "Next up: **pr** — I'll create a PR. Switch to sonnet + medium (or keep current if already set)."**
   - Stage and commit each group in dependency order

   **pr phase** — `/opsx:pr`
   - **Start:** Announce: "Starting **PR** phase. I'll gather the commit history and spec context, then draft a PR."
   - **Config:** run `/model sonnet` + `/effort medium`
   - Gather commit history + OpenSpec context
   - Draft PR title and structured body
   - **Checkpoint: show draft, ask "Create PR?" Tell user: "Review the PR description above. If it looks good, I'll create it on GitHub."**
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

   ### Token Notes
   - `/compact` was used at: [propose ✓ / apply groups ✓ / post-apply ✓ / archive ✓]
   - Run `/context` to see total token usage for this session
   ```

**Resume support**

If the pipeline is interrupted (e.g., build fails during apply), re-run `/opsx:e2e <name>` to resume from the current phase.

On resume, the agent will:

1. Run `openspec status --change "<name>" --json` to detect current phase
2. Check `git status` for dirty working tree — if uncommitted changes exist, ask: "You have uncommitted changes. Stash them before resuming, or continue with dirty state?"
3. Check branch existence — if missing, recreate from main
4. Report detected phase and offer to resume or restart

```
$ /opsx:e2e implement-iam-module
  ✓ Change exists
  ✓ Git is clean
  ✓ Branch: feat/implement-iam-module
  ✓ 12/33 tasks complete
  Resuming from apply phase (task 13).
  Continue from where we left off? (Y/n)
```

**Guardrails**

- Never commit directly on main — branch creation is mandatory
- Every checkpoint pauses and waits for your confirmation — no silent progression
- On build/lint failure in apply phase: always pause, never auto-fix without showing the error
- If change doesn't exist when running with a name, start from explore phase
- If no name provided and no change exists, prompt: "Describe what you want to build"
- If a phase's command has its own guardrails (e.g., commit never stages sensitive files), those still apply

**Checkpoint behavior**

At each phase boundary, the agent:

1. **Shows a summary** of what just happened
2. **Tells you what's next** and what model/effort to switch to
3. **Waits for your confirmation** before proceeding

Checkpoint format:

```
═══ Checkpoint: <phase name> ═══

✓ <phase> complete: <key outcome>

Next up: <next phase> — <one-line description>
▶ Before proceeding, run: `/model X` + `/effort Y`

[Proceed to next phase?] (Y/n)
```

Your options at any checkpoint:

- `Y` or Enter — **continue** to the next phase (switch model first if prompted)
- `n` — **stop** the pipeline. The agent pauses and waits for you to manually resume later with `/opsx:e2e <name>`.
- **Describe a change** — e.g., "fix this issue before continuing" — the agent handles your request, then re-enters the checkpoint for your confirmation.
