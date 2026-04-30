# Claude Code Configuration for Spec-Driven Workflow

> **Audience:** Developers using Claude Code with the UniHub monorepo.
> **Purpose:** Optimize cost, speed, and reasoning quality across each phase of the spec-driven development cycle.

## 1. Overview

Claude Code provides three knobs to control how it tackles a task: **model selection**, **effort level**, and the **ultrathink** keyword. Each phase of the spec-driven workflow demands a different balance of reasoning depth, speed, and token cost. This guide maps the right configuration to each phase.

```
Cost            ┌─── max ───┐
▲               │           │
│        ┌──── xhigh ──────┤
│        │                 │
│    ─── high ─────────────┤
│    │                     │
│    medium                │
│    │                     │
│    low                   │
└──────────────────────────▶ Reasoning Depth
```

### 1.1 How to Apply Settings

| Method | Scope | Example |
|--------|-------|---------|
| `/model <alias>` | Current session | `/model opus` |
| `/effort <level>` | Current session (persisted) | `/effort xhigh` |
| `ultrathink` in prompt | Single turn | `"... use ultrathink to analyze ..."` |
| `--model` flag | CLI launch | `claude --model opus` |
| `--effort` flag | CLI launch | `claude --effort xhigh` |
| `settings.json` | Persistent | `{ "model": "opusplan", "effortLevel": "xhigh" }` |
| `CLAUDE_CODE_EFFORT_LEVEL` | Environment | `export CLAUDE_CODE_EFFORT_LEVEL=max` |

### 1.2 Where Settings Live

```
.claude/
├── settings.json          # Project-level (checked in, team-wide)
├── settings.local.json    # User-level (gitignored, personal override)
└── commands/opsx/
    └── <command>.md       # Per-command model/effort in frontmatter
```

Settings priority (highest to lowest):

1. Environment variables (`CLAUDE_CODE_EFFORT_LEVEL`)
2. Frontmatter in command/skill files
3. Command-line flags (`--model`, `--effort`)
4. Session commands (`/model`, `/effort`)
5. `settings.local.json`
6. `settings.json`

---

## 2. `/model` — Model Selection

### 2.1 Available Aliases

| Alias | Model | Best For | Speed | Cost |
|-------|-------|----------|-------|------|
| `haiku` | Claude Haiku | Simple, high-volume, mechanical tasks | ⚡⚡⚡ | $ |
| `sonnet` | Claude Sonnet 4.6 | Daily coding tasks, balanced | ⚡⚡ | $$ |
| `opus` | Claude Opus 4.7 | Complex reasoning, architecture, deep analysis | 🐢 | $$$$ |
| `opusplan` | Opus → Sonnet hybrid | Planning with Opus, execution with Sonnet | ⚡~🐢 | $$$ |
| `best` | Most capable (currently Opus) | When you want maximum capability | 🐢 | $$$$ |
| `sonnet[1m]` | Sonnet + 1M context | Long sessions with large codebases | ⚡⚡ | $$$ |
| `opus[1m]` | Opus + 1M context | Deep analysis of very large codebases | 🐢 | $$$$$ |

### 2.2 `opusplan` — The Hybrid Mode

The `opusplan` alias provides an automated hybrid approach that is ideal for the spec-driven workflow:

| Phase | Model Used | Why |
|-------|-----------|-----|
| Planning (propose, explore, design) | `opus` | Complex reasoning, architecture decisions |
| Execution (apply, commit, pr) | `sonnet` | Efficient code generation, drafting |

This is the recommended default model for most of the workflow. Switch to pure `opus` only when a phase demands maximum reasoning throughout.

### 2.3 When to Use Each Model

**Use `haiku` when:**

- Creating branches (`/opsx:branch`)
- Archiving changes (`/opsx:archive`)
- Running mechanical git operations
- Trivial file edits with no logic changes

**Use `sonnet` when:**

- Implementing pattern-heavy code (repositories, controllers)
- Drafting commit messages and PR bodies
- Running verification checks
- Any task where the approach is clear and execution is straightforward

**Use `opus` when:**

- Designing database schemas
- Implementing complex business logic (services, guards, mechanics)
- Debugging TypeScript build errors
- Writing spec artifacts (proposal, design, specs)
- Generating Contract-Oriented JSDoc
- Any task where a mistake would be costly to fix later

**Use `opusplan` when:**

- The task has both planning and execution phases
- You want Opus-level design decisions with Sonnet-speed implementation
- You're in a long session and want to manage context/token usage

---

## 3. `/effort` — Effort Levels

### 3.1 Available Levels

Opus 4.7 supports five levels. Opus 4.6 and Sonnet 4.6 support four (no `xhigh`).

| Level | Token Spend | Best For | Persists? |
|-------|------------|----------|-----------|
| `low` | Minimal | Short, scoped, latency-sensitive tasks | ✅ Yes |
| `medium` | Moderate | Cost-sensitive work, trade some intelligence | ✅ Yes |
| `high` | High (default on 4.6) | Minimum for intelligence-sensitive work | ✅ Yes |
| `xhigh` | Very High (default on 4.7) | **Best for most coding/agentic tasks** | ✅ Yes |
| `max` | Unlimited (no constraint) | Demanding tasks, troubleshooting, debugging | ❌ Session only |

### 3.2 Behavioral Differences

```
low      → quick answer, minimal thinking, skips non-obvious paths
medium   → some thinking, catches obvious edge cases
high     → thorough analysis, most edge cases covered
xhigh    → deep reasoning, nearly all edge cases considered
max      → exhaustive reasoning, no token limit (may overthink)
```

The effort scale is **calibrated per model**, so `high` on Opus 4.7 is not the same as `high` on Sonnet 4.6.

### 3.3 When to Use Each Level

**Use `low` for:**

- Branch creation (`/opsx:branch`)
- Archive operations (`/opsx:archive`)
- Simple git status checks
- Running predefined scripts

**Use `medium` for:**

- Controller implementation (thin wiring)
- Drafting PR bodies from templates
- Commit message generation
- Spec sync (mechanical file copy)

**Use `high` for:**

- Repository implementation (pattern-based but needs correctness)
- Verification checks
- Code review and lint fixes
- Exploration with clear direction

**Use `xhigh` for:**

- **Most coding tasks** (default on Opus 4.7)
- Schema design
- Service implementation
- JSDoc generation
- Artifact creation (proposal, design, specs)
- Parallel subagent coordination

**Use `max` for:**

- Debugging complex TypeScript build errors
- Tricky type inference issues
- Race condition analysis
- Security-sensitive code review
- One-off deep investigation

---

## 4. `ultrathink` — One-Off Deep Reasoning

### 4.1 What It Is

`ultrathink` is an **in-context instruction** — you include the word in your prompt to tell the model to reason more deeply on that specific turn. It does **not** change the effort level sent to the API.

```
ultrathink vs /effort max:
─────────────────────────────────────────────
/effort max    → Changes API parameter, persists for session
ultrathink     → In-prompt hint, applies to one turn only
```

### 4.2 When to Use

| Scenario | Use Ultrathink? |
|----------|----------------|
| Designing a new DB schema with constraints | ✅ Yes |
| Debugging 12 TypeScript errors at once | ✅ Yes |
| Writing a complex service method | ✅ Yes |
| Creating spec artifacts for a new capability | ✅ Yes |
| Generating JSDoc with business context | ✅ Yes |
| Creating a git branch | ❌ No |
| Archiving a change | ❌ No |
| Running a build check | ❌ No |
| Drafting a commit message | ❌ No |

### 4.3 How to Use

Simply include the keyword in your natural language prompt:

```
❌ /opsx:apply implement-iam-module (task 8.1)
   → standard reasoning

✅ "Please use ultrathink to analyze the auth service
    requirements and implement login with all edge cases"
   → deep reasoning on this turn
```

Or combine with effort setting for maximum effect:

```
Set /model opus and /effort max, then include
"ultrathink" in your prompt for the most
thorough possible analysis.
```

---

## 5. Phase-by-Phase Configuration

### 5.1 Quick Reference Table

| # | Phase | Model | Effort | Ultrathink | Rationale |
|---|-------|-------|--------|------------|-----------|
| 1 | **explore** | `opusplan` | `high` | — | Opus reads specs, Sonnet searches codebase |
| 2 | **propose** | `opus` | `xhigh` | ✅ | Deep reasoning for artifacts |
| 3 | **branch** | `haiku` | `low` | — | Mechanical git operation |
| 4 | **apply** — schema | `opus` | `xhigh` | ✅ | Schema design affects all downstream code |
| 5 | **apply** — DTOs | `sonnet` | `high` | — | Pattern-based, straightforward |
| 6 | **apply** — repos | `sonnet` | `high` | — | CRUD patterns, some ORM specifics |
| 7 | **apply** — services | `opus` | `xhigh` | ✅ | Business logic, error codes, side effects |
| 8 | **apply** — controllers | `sonnet` | `medium` | — | Thin layer, mostly routing |
| 9 | **apply** — fix build | `opus` | `max` | ✅ | Debugging needs maximum reasoning |
| 10 | **verify** | `opusplan` | `high` | — | Cross-reference, pattern matching |
| 11 | **archive** | `haiku` | `low` | — | File operations, no intelligence needed |
| 12 | **docs** | `opus` | `xhigh` | ✅ | Context-aware JSDoc needs deep understanding |
| 13 | **commit** | `sonnet` | `medium` | — | Group files, draft messages |
| 14 | **pr** | `sonnet` | `medium` | — | Draft from templates, no deep reasoning |

### 5.2 Cost-Speed Spectrum

```
Phase               Cost     Speed
──────────────────────────────────────────────
archive             $        ⚡⚡⚡
branch              $        ⚡⚡⚡
commit              $$       ⚡⚡
pr                  $$       ⚡⚡
verify              $$       ⚡⚡
apply (controllers) $$       ⚡⚡
apply (DTOs)        $$       ⚡⚡
apply (repos)       $$       ⚡⚡
explore             $$$      ⚡
propose             $$$$     🐢
apply (schema)      $$$$     🐢
apply (services)    $$$$     🐢🐢
docs                $$$$     🐢🐢
apply (fix build)   $$$$$    🐢🐢🐢
```

### 5.3 Session Strategy

For a typical change (e.g., implementing a module with 20-40 tasks), this configuration strategy minimizes total cost while maintaining quality:

```
Start session:
  /model opusplan
  /effort xhigh

┌──────────────────────────────────────────────────┐
│  Beginning of session — heavy phases:            │
│  • propose:  /model opus + ultrathink            │
│  • schema:   /model opus + ultrathink            │
│  • services: /model opus + ultrathink            │
│  • docs:     /model opus + ultrathink             │
│                                                  │
│  Middle of session — efficient phases:           │
│  • DTOs, repos, controllers: default (opusplan)  │
│  • commit, pr: default (sonnet via opusplan)     │
│                                                  │
│  End of session — mechanical:                    │
│  • archive:   /model haiku + /effort low         │
│  • branch:    /model haiku + /effort low         │
└──────────────────────────────────────────────────┘

End session:
  /effort xhigh  (restore default)
```

---

## 6. Configuration Quick Reference

### 6.1 CLI Commands

```bash
# Model
/model                          # Open interactive picker
/model opus                     # Switch to Opus 4.7
/model sonnet                   # Switch to Sonnet 4.6
/model haiku                    # Switch to Haiku
/model opusplan                 # Hybrid: Opus plan, Sonnet execute
/model opus[1m]                 # Opus with 1M context

# Effort
/effort                         # Open interactive slider
/effort low                     # Minimal thinking, fast
/effort medium                  # Balanced cost/quality
/effort high                    # Thorough analysis
/effort xhigh                   # Deep reasoning (default Opus 4.7)
/effort max                     # Unlimited tokens (session only)
/effort auto                    # Reset to model default

# Ultrathink (in-prompt only)
"... use ultrathink to deeply analyze ..."
```

### 6.2 Settings File

```json
{
  "model": "opusplan",
  "effortLevel": "xhigh",
  "maxThinkingTokens": 8192
}
```

Place in `.claude/settings.json` (project) or `.claude/settings.local.json` (personal).

### 6.3 Environment Variables

```bash
# Persistent effort override (highest priority)
export CLAUDE_CODE_EFFORT_LEVEL=max

# Pin model versions for team consistency
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-opus-4-7"
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-4-6"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-haiku-4-5"
```

### 6.4 Command Frontmatter

For OPSX commands that always need a specific configuration, add frontmatter:

```yaml
---
name: "OPSX: Archive"
description: Archive a completed change
model: haiku
effort: low
---
```

This overrides the session settings only while that command runs.

---

## 7. Troubleshooting

### Model or effort not changing

```bash
# Check current model and effort
/status

# Verify no env var is overriding
echo $CLAUDE_CODE_EFFORT_LEVEL

# Check settings files
cat .claude/settings.local.json | grep -E 'model|effort'
cat .claude/settings.json | grep -E 'model|effort'
```

### Effort level not supported

If you set a level the active model doesn't support (e.g., `xhigh` on Sonnet 4.6), Claude Code falls back to the highest supported level at or below the one you set.

| Set | On Opus 4.7 | On Opus 4.6 | On Sonnet 4.6 |
|-----|-------------|-------------|---------------|
| `xhigh` | ✅ xhigh | ⚠️ Runs as `high` | ⚠️ Runs as `high` |
| `max` | ✅ max | ✅ max | ✅ max |

### Ultrathink not working

Ultrathink is an in-context hint, not a guaranteed behavior. If the model isn't reasoning deeply enough:

1. Set `/effort max` for the session
2. Be explicit: "Analyze this step by step, considering all edge cases"
3. If still insufficient, switch to `/model opus`

---

## 8. Prompt Caching & Model Switching

### 8.1 How Switching Models Affects Cache

When you change models mid-session via `/model`, the **prompt cache is invalidated**. The docs confirm:

> *"The picker asks for confirmation when the conversation has prior output, since the next response re-reads the full history without cached context."*

```
Turn 1 (opus, cached)   → cache hit, fast, cheap
/model sonnet            → ⚠️ cache cleared
Turn 2 (sonnet, cold)    → cache miss, slow, costly rebuild
Turn 3 (sonnet, cached)  → cache hit again
```

**Context is preserved** — the full conversation history remains intact. Only the cache is lost; the next turn must re-send the entire context to the server.

### 8.2 Cache TTL

Anthropic prompt cache has a **5-minute TTL**. If you pause between phases for longer than 5 minutes, the cache is already cold anyway — switching models at that point adds no extra cost.

### 8.3 `opusplan` — Internal Switching

`opusplan` is a special alias: it uses Opus in plan mode and Sonnet in execution mode. This is **internal switching**, not routed through `/model`, so it **does not invalidate the cache**. There is no penalty for using `opusplan`.

### 8.4 Impact on the Hybrid Workflow

| Pattern | Cache Impact | Verdict |
|---------|-------------|---------|
| Session default `opusplan` | None (internal switch) | ✅ Optimal |
| Frontmatter commands (branch, archive, commit, pr, verify) | 1 cold turn per command | ✅ Acceptable — each is 1-2 turns |
| Switch to Opus mid-apply for build debugging | 1 cold turn | ✅ Worth it — fixing 12 errors > 1 cold turn |
| /model opus → /model sonnet → /model opus repeatedly | 2 cold turns | ❌ Wasteful — avoid flip-flopping |

**Rule of thumb:** Keep the same model throughout a long phase. Only switch at phase boundaries or when genuinely stuck (debugging, schema design).

### 8.5 Cost-Benefit for the Spec-Driven Workflow

```
Phase             Turns  Cache hit rate    Switch cost    Net benefit
──────────────────────────────────────────────────────────────────────
archive             1-2   0% (short)       1 cold turn    ✅ (haiku cheaper)
branch              1     0%               1 cold turn    ✅ (haiku cheaper)
commit              2-3   50%              1 cold turn    ✅ (sonnet sufficient)
pr                  1-2   0%               1 cold turn    ✅ (sonnet sufficient)
verify              3-5   60%              1 cold turn    Maybe (sonnet vs opusplan)
propose            10-20  >80%             1 cold turn    ❌ Keep opusplan
apply (schema)      5-10  >70%             1 cold turn    Maybe (if very hard)
apply (services)   10-20  >80%             1 cold turn    ❌ Keep opusplan
docs               8-15   >75%             1 cold turn    Maybe (if deep context needed)
```

**Bottom line:** The current frontmatter setup (branch, archive with haiku; commit, pr with sonnet; verify with sonnet) is sound. Do **not** add frontmatter for propose, apply, or docs — these are long phases with high cache hit rates; switching would lose more than it gains.

### 8.6 Best Practices

- **Use `ultrathink` instead of switching models** when you need deep reasoning for 1-2 turns — no cache invalidation
- **Use `/effort max` instead of `/model opus`** if the current model is already Opus — cache stays, only thinking budget increases
- **Switch models at phase boundaries** — finish the old phase, start the new one (cache rebuilds naturally during the new phase)
- **Prefer `opusplan`** — gets Opus for planning, Sonnet for execution, with zero cache penalty
- **Avoid toggling** between two models within the same phase — doubles the cache miss cost

---

## References

- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
- [Claude Code settings](https://code.claude.com/docs/en/settings)
- [Effort parameter documentation](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Spec-Driven Development Workflow](./spec-driven-workflow.md)
