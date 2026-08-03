# Mutation testing

Line coverage tells you a line ran. It does not tell you that anything would
have noticed if that line were wrong. Mutation testing answers the second
question: Stryker rewrites the source in small, plausible ways (`>` becomes
`>=`, `&&` becomes `||`, a boolean flips) and reruns the suite. If the tests
still pass, the mutant **survived** — the suite cannot distinguish correct code
from broken code at that point.

Baseline measured on 2026-08-03 against `main`:

| Metric | Value |
|---|---|
| Unit tests | 651 passing, 14,8 s |
| Line coverage | 55,89 % |
| Mutants generated | 1693 across 20 files |
| Killed / Survived / No coverage / Timeout | 733 / 253 / 276 / 5 |
| Mutation score (Stryker) | **73,97 %** |
| Mutation score counting no-coverage as failed | **57,85 %** |
| Full invariant-scope run | 4 min 47 s at concurrency 4 |

Read those last two rows together. Stryker's own score excludes mutants no test
ever reached, which flatters the result. The 57,85 % figure is the honest one.

## Scope

Mutating everything wastes compute on code that has no behaviour to get wrong.
`apps/server/stryker.conf.mjs` limits mutation to files carrying a business
invariant from `docs/blueprint`:

| ID | Invariant | Where |
|---|---|---|
| I1 | No overselling of seats | `modules/booking/{services,mechanics,repositories}` |
| I2 | No double charge | `modules/payment/mechanics/idempotency`, `repositories/idempotency-keys`, `services/payment-reconciliation` |
| I3 | Payment gateway fault isolation | `modules/payment/mechanics/circuit-breaker`, `guards`, `services/payments` |
| I4 | Atomic rate limiting, fail-open | `modules/rate-limit` |
| I5 | RBAC and IDOR prevention | `modules/iam/guards` |
| I6 | Idempotent offline check-in | `modules/checkin/services` |
| I7 | Idempotent CSV import | `modules/csv-sync` |
| I8 | Cache is a pre-filter, not enforcement | `modules/catalog/services/seat-counter` |

DTOs, Nest modules, barrels, `main.ts` and config are excluded — mutants there
are overwhelmingly equivalent. `StringLiteral`, `ObjectLiteral` and
`ArrayDeclaration` mutators are disabled for the same reason; they accounted for
426 Ignored mutants in the baseline.

## Running it

```bash
# From the repo root
pnpm stryker                    # invariant scope, reuses prior verdicts
pnpm mutation:bundle            # turn the report into a readable dossier

# From apps/server, for a single file
pnpm exec stryker run --mutate "src/modules/booking/mechanics/seat-lock.mechanic.ts" --force

# Everything mutable, no incremental reuse (slow)
pnpm --filter server stryker:full
```

Reports land in `apps/server/reports/mutation/` (gitignored):

| File | Purpose |
|---|---|
| `index.html` | Interactive report — open this first |
| `report.json` | Raw Stryker output |
| `pr-comment.md` | Summary posted on the PR |
| `ai-bundle.md` | Survivor dossier for agent triage |
| `summary.json` | Metrics for CI steps |

## Where the weak spots are

The baseline points at specific files rather than a vague "add more tests":

| File | Score | Reading |
|---|---:|---|
| `rate-limit/services/sliding-window.service.ts` | 45,2 % | 23 of 47 mutants survive. The spec exists and executes the code, but asserts too little to catch a broken sliding window. |
| `booking/repositories/registrations.repository.ts` | 50,0 % | 64 mutants never execute at all. |
| `payment/repositories/payments.repository.ts` | 59,6 % | Same pattern, smaller. |
| `iam/guards/workshop-scope.guard.ts` | n/a | No spec exists. 19 mutants, none reached. IDOR prevention is untested. |
| `payment/repositories/idempotency-keys.repository.ts` | n/a | No spec. 36 mutants unreached. |
| `payment/services/payment-reconciliation.service.ts` | n/a | No spec. 33 mutants unreached. |
| `iam/guards/jwt-auth.guard.ts` | 100 % | 22 mutants, all killed. |
| `catalog/services/seat-counter.service.ts` | 100 % | 12 mutants, all killed. |

A score of "n/a" is worse than a low score: Stryker cannot compute a ratio
because zero mutants were ever executed. Three files guarding real invariants
are in that state.

## CI lanes

| Workflow | Trigger | Blocks merge | What it answers |
|---|---|---|---|
| `ci.yml` → `verify` | every PR and push to main | **yes** | Does it lint, typecheck, build, and pass 651 unit tests? |
| `ci.yml` → `quarantine` | same | no | Integration and e2e status. Both are currently failing (58/114 and 68/83) and were broken before this pipeline existed. |
| `mutation.yml` | PR touching `apps/server/src`, plus nightly | no | Are the files this PR changed actually protected by tests? Nightly re-checks the full invariant scope. |
| `mutation-ai-review.yml` | `mutation:ai-review` label, weekly, manual | no | An agent's triage of surviving mutants. Opt-in. |

Mutation testing never blocks a merge. Stryker runs with `thresholds.break: null`
by design: a gate on mutation score gets bypassed the first time it fires on a
deadline, and a metric that people route around stops being measured honestly.
The result is a comment on the PR, which is a conversation rather than an
obstacle.

## The AI lane

`mutation-ai-review.yml` hands `ai-bundle.md` to an agent that classifies each
survivor as EQUIVALENT, MISSING ASSERTION, or MISSING TEST, and drafts the test.

Two constraints are deliberate:

**It is opt-in.** Authentication uses `CLAUDE_CODE_OAUTH_TOKEN`, drawing on a
Claude subscription quota shared with everyday development. Running it on every
push would spend that quota on noise. The deterministic half of the pipeline —
Stryker plus `mutation-ai-bundle.mjs` — costs nothing and never varies, so the
pipeline keeps working whether or not the agent runs.

**Its output is a draft.** The agent may read the repo and write one report
file. It does not edit source, does not commit, and does not open PRs.

### Setup

1. `claude setup-token` locally (requires Claude Pro or Max).
2. Repo Settings → Secrets and variables → Actions → new secret named
   `CLAUDE_CODE_OAUTH_TOKEN`.
3. Create the label `mutation:ai-review`.

### Validating what the agent proposes

An LLM assertion can be plausible and still kill nothing — it may assert a value
that happens to match the mutant's output, assert an implementation detail, or
take the buggy behaviour as the oracle. All three produce a green test with zero
detection power.

The check is behavioural and runs in both directions:

```bash
cd apps/server
node scripts/mutation-validate.mjs \
  --file src/modules/booking/mechanics/seat-lock.mechanic.ts \
  --line 109
```

1. The test must **pass** on the original program — otherwise it is broken, not strict.
2. The mutant at that line must come back **Killed** — otherwise the test distinguishes nothing.

Exit 0 accepts, exit 1 rejects, exit 2 means the run was inconclusive (for
example every mutant at that line is on the exclusion list). No AI-drafted
assertion is merged without this gate passing.

## Known constraints

- **pnpm and plugin discovery.** Stryker globs `node_modules/@stryker-mutator/*`
  to find plugins, which pnpm's non-flat layout defeats. The runner is declared
  explicitly via `plugins: [...]` in the config; removing that line breaks the
  run with "no TestRunner plugins were loaded".
- **`inPlace: true` is required.** pnpm stores dependencies as relative symlinks
  into the workspace root. Stryker's sandbox sits at a different directory depth
  and those symlinks do not resolve. Mutating in place sidesteps it, at the cost
  of needing a clean working tree.
- **Line ranges in `--mutate` do not narrow the run.** Verified 2026-08-03:
  `--mutate "file.ts:109-109"` still produced all 27 mutants of the file.
  `mutation-validate.mjs` mutates the whole file and filters by line itself.
- **24 of 55 spec files read the real clock** (`Date.now()`, `new Date()`) with
  no fake timers. Under parallel mutation load they get slower, which shows up
  as Timeout and is scored as killed — inflating the result. `timeoutMS` is set
  to 60 s with `timeoutFactor: 2.5` to reduce this; `concurrency` is pinned to 2
  in CI to match the 2 vCPU runner.
- **Unit specs only.** Integration and e2e boot `AppModule`, are slower, and are
  currently failing anyway.
