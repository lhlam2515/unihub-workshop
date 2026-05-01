# Spec-Driven Development Workflow with Subagents — Guideline

> **Audience:** Developers and AI agents working in the UniHub monorepo.
> **Prerequisites:** OpenSpec CLI installed (`openspec --version`), Node.js >= 18, pnpm >= 9.
> **Subagents:** opsx-architect, opsx-verifier, opsx-gitops.

## 1. Overview

Spec-Driven Development with Subagents orchestrates specialized AI assistants to handle distinct phases of the development lifecycle. This model preserves your main conversation context by delegating verbose or mechanical tasks to isolated agent windows.

```
Exploration / Spec       Implementation (Main/Fork)      Verification / Docs           Closure
──────────────────       ──────────────────────────      ───────────────────           ───────
 [opsx-architect]    →       [Main Session]         →     [opsx-verifier]       →   [opsx-gitops]
        │                           │                            │                        │
    /propose                  /branch & /apply             /verify & /docs         /archive & /pr
```

The workflow leverages the **Chain of Subagents** pattern: each agent excels at its specific domain, enforcing tool restrictions and managing its own memory [cite: Documentation Index].

## 2. Subagent Ecosystem

To optimize performance and cost, we use a hybrid approach of high-reasoning and lightweight models [cite: Documentation Index].

| Subagent | Default Model | Effort | Tools | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **`opsx-architect`** | `sonnet` / `opus` | `xhigh` | Read, Write, Bash, Glob | Exploration, Proposal, Design, Specs, and Task breakdown. |
| **`Implementation`** | `inherit` | `high` | All Tools | Branching and code implementation (Main session or Fork). |
| **`opsx-verifier`** | `sonnet` | `medium` | Read, Bash, Glob | Build/Lint verification, spec cross-referencing, and JSDoc. |
| **`opsx-gitops`** | `haiku` | `low` | Read, Bash | Archiving, syncing specs, multi-task committing, and PR creation. |

## 3. Detailed Workflow

### Phase 1: Exploration & Specification (`opsx-architect`)

**Trigger:** "Help me design [feature] using opsx-architect."

1. **Investigation:** The agent runs `/opsx:explore` to read existing specs and code for business context [cite: spec-driven-workflow.md].
2. **Artifact Generation:** It executes `/opsx:propose` to scaffold the change directory and create the 4 core artifacts (`proposal.md`, `design.md`, `specs/`, `tasks.md`) [cite: spec-driven-workflow.md].
3. **Tasking:** It decomposes requirements into atomic implementation steps in `tasks.md`.

### Phase 2: Implementation (Main Session / Fork)

**Trigger:** `/opsx:branch` and `/opsx:apply`.

1. **Isolation:** Use `/opsx:branch` to create a feature branch (`feat/`, `fix/`, etc.) [cite: spec-driven-workflow.md].
2. **Coding:** Execute `/opsx:apply`. For complex tasks, use `/fork` to maintain the planning context while isolating implementation logs [cite: Documentation Index].
3. **Checkpoints:** Periodically run `pnpm build` and `tsc`. Use `/compact` before moving between task groups (e.g., after DTOs, before Services).

### Phase 3: Verification & Documentation (`opsx-verifier`)

**Trigger:** "Verify my implementation with opsx-verifier."

1. **Quality Check:** Runs `/opsx:verify` to execute type checks and linting. It cross-references every requirement in the delta specs with the codebase [cite: spec-driven-workflow.md].
2. **Contract Documentation:** Runs `/opsx:docs` to generate Contract-Oriented JSDoc for all public methods in the modified files [cite: spec-driven-workflow.md].

### Phase 4: Closure & Delivery (`opsx-gitops`)

**Trigger:** "Close the cycle with opsx-gitops."

1. **Archive:** Runs `/opsx:archive` to sync delta specs to the Source of Truth and move the change to the archive folder [cite: spec-driven-workflow.md].
2. **Commits:** Executes `/opsx:commit`, grouping files by task dependency order (Schema → Repos → Services) rather than layers [cite: spec-driven-workflow.md].
3. **Pull Request:** Runs `/opsx:pr` to generate a structured PR body with completion metrics and verification status.

## 4. Context & Memory Management

- **Isolated Logs:** Subagents prevent build/lint logs from flooding the main context [cite: Documentation Index].
- **Persistent Memory:** Each subagent is configured with `memory: project`. They record architectural insights and recurring patterns to improve future reviews [cite: Documentation Index].
- **Compaction:** Always run `/compact` at phase boundaries (e.g., after `opsx-architect` returns) to keep the main conversation lean.

## 5. Command Reference

- `/opsx:explore`: Investigate requirements.
- `/opsx:propose`: Create change artifacts.
- `/opsx:branch`: Create conventional feature branch.
- `/opsx:apply`: Execute implementation tasks.
- `/opsx:verify`: Verify completeness and correctness.
- `/opsx:docs`: Generate JSDoc.
- `/opsx:archive`: Sync specs and move to archive.
- `/opsx:commit`: Multi-task semantic commits.
- `/opsx:pr`: Create GitHub Pull Request.
