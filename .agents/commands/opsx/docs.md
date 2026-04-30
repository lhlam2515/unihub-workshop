---
name: "OPSX: Docs"
description: Generate Contract-Oriented JSDoc for implemented code files using spec artifacts
category: Workflow
tags: [workflow, documentation, jsdoc]
---

Generate JSDoc documentation for implemented code files, following the project's Contract-Oriented Documentation standard (`.agents/rules/documentation.md`).

Leverages OpenSpec change artifacts (specs, design) for business context so every JSDoc block encodes intent, not implementation.

**Input**: One of:
- A change name (e.g., `/opsx:docs implement-iam-module`)
- Specific file paths (e.g., `/opsx:docs apps/server/src/modules/iam/services/auth.service.ts`)
- A module path (e.g., `/opsx:docs apps/server/src/modules/iam/`)
- Omit to auto-detect from the current change in `openspec/changes/`

---

**Steps**

1. **Determine documentation scope**

   If change name provided:
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse `applyRequires` and `artifacts` to understand what schemas/specs exist.

   If file paths provided: use them directly.
   If module path: `find <path> -name '*.ts' ! -name '*.spec.ts' ! -name '*.e2e-spec.ts'`
   If omitted: run `openspec list --json` to find active changes. If more than one, prompt user.

2. **Load context artifacts**

   Read the project documentation rules:
   `.agents/rules/documentation.md`

   **If a change name was provided or auto-detected:**
   - Read `openspec/changes/<name>/specs/` (delta specs) for business requirements
   - Read `openspec/changes/<name>/proposal.md` for intent and scope
   - Read `openspec/changes/<name>/design.md` for design decisions

   For each delta spec, extract:
   - Capability name and description
   - Requirements (### Requirement: lines)
   - Scenarios (#### Scenario: lines) — edge cases the JSDoc should reference

   For design.md, extract:
   - Key decisions affecting the code
   - Architectural patterns used

3. **Collect target files**

   If change name or auto-detected:
   - Read `openspec/changes/<name>/tasks.md` to map completed tasks to file paths
   - Run `git diff main...HEAD --name-only` to find changed files in the module
   - Cross-reference to identify files belonging to this change
   - Filter to `apps/server/src/modules/` + `apps/server/src/database/` + `apps/server/src/shared/`

   Filter out test files (`*.spec.ts`, `*.e2e-spec.ts`, `*.test.ts`), migration files, and config files.

3b. **Pre-scan for JSDoc gaps**

   Before sending files to the documentation agent, run a gap analysis:

   ```bash
   for f in <target-files>; do
     # Find method definitions (async, static, or regular) not preceded by /**
     awk 'NR>1 && /^\s+(async |static )?[a-zA-Z_][a-zA-Z0-9_]*\s*\(/ && !/^\s+constructor\(/ {
       if (prev !~ /\/\*\*/) print FILENAME":"NR": "$0
     } { prev=$0 }' "$f"
   done
   ```

   Only send files WITH missing JSDoc to the agent. Skip files that already
   meet the Contract-Oriented standard. This typically cuts agent input by 40-60%.

4. **Classify files by architectural layer**

   | Layer | Pattern | Documentation Focus |
   |-------|---------|-------------------|
   | Controller | `*.controller.ts` | HTTP contract, security, params source |
   | Service | `*.service.ts` | Business rules, side effects, error codes |
   | Repository | `*.repository.ts` | Data access logic, locking, indexes |
   | DTO / Builder | `*.dto.ts` | Data contract, transformation rules |
   | Mechanic | `*.mechanic.ts` | Complex infra operation, invariants |

5. **Document each file**

   For each file in dependency order (repositories → services → controllers → DTOs):

   a. **Read the full source** with the Read tool.
   b. **Analyze each public/protected method**:
      - Infer intent from method name, params, return type, implementation
      - Identify business rules (conditionals, validations, state checks)
      - Identify side effects (DB writes, Redis mutations, API calls)
      - Identify error codes returned via `Result.fail()`
   c. **Generate JSDoc** following the Contract-Oriented format:

   **Layer-specific templates:**

   *Service method:*
   ```typescript
   /**
    * [Active verb] [what it does, encoding business intent].
    *
    * Business rules:
    * - [Domain invariant or constraint enforced by this method]
    *
    * Side effects:
    * - [Each DB write, Redis mutation, external API call, or event emission]
    *
    * @param name - [Semantic meaning and constraints]
    * @returns OkResult containing [type], or FailResult with codes:
    *   - [ERROR_CODE]: [When this error occurs]
    * @throws [Only for unhandled exceptions — rare in Service layer]
    */
   ```

   *Controller method:*
   ```typescript
   /**
    * [HTTP method] [endpoint] — [Business intent in active voice].
    *
    * Security: [Guard/Role requirements]
    *
    * @param name - [Semantic meaning, source, and constraints]
    * @returns OkResult containing [response DTO], or FailResult with codes:
    *   - [ERROR_CODE]: [When this error occurs]
    * @throws [Only for unhandled exceptions — ZodValidationException from pipes]
    */
   ```

   *Repository method:*
   ```typescript
   /**
    * [Active verb] [what data operation it performs].
    *
    * Database: [Specific Drizzle operation, indexes used, locking strategy]
    *
    * @param name - [Semantic meaning]
    * @returns OkResult containing [type], or FailResult with codes:
    *   - SYSTEM_ERROR: Database or connection failure
    * @throws [Only for unhandled exceptions — fatal database errors]
    */
   ```

   *DTO Builder:*
   ```typescript
   /**
    * Builds a [name] response DTO from domain entities.
    *
    * Transformation rules:
    * - [Each field mapping, exclusion, or coercion]
    *
    * @param entities - [Source domain entities]
    * @returns [The constructed DTO]
    */
   ```

   d. **Apply documentation rules constraints**:
      - Summary line: present-tense active verb, no filler words, no "This function..."
      - @param: describe domain meaning, NOT TypeScript type
      - @returns: list specific ErrorCode strings for FailResult paths
      - @throws: ONLY for unhandled exceptions (framework pipes, fatal errors)
      - Business rules: bullet list of domain invariants
      - Side effects: bullet list of state mutations
      - No inline comments explaining WHAT (code is self-documenting)

   e. **Update the file** using the Edit tool, inserting JSDoc blocks before each method signature.

6. **Track progress and report**

   Maintain a checklist of processed files with counts:
   - Methods documented
   - Business rules captured
   - Error codes listed
   - Side effects documented

   ```
   ## Documentation Complete: <scope>

   ### Documented Files
   | File | Methods | Rules | Errors | Effects |
   |------|---------|-------|--------|--------|
   | `auth.service.ts` | 4 | 3 | 3 | 5 |

   ### Coverage Summary
   - **Controllers**: N methods — HTTP contracts documented
   - **Services**: N methods — Business rules, error codes, side effects captured
   - **Repositories**: N methods — Data access patterns documented
   - **DTOs**: N builders — Transformation rules documented

   All JSDoc follows the Contract-Oriented standard (`.agents/rules/documentation.md`).
   ```

**Guardrails**
- Never document test files, migration files, or config files
- Never modify implementation logic — only add/update JSDoc blocks
- If a method already has a valid JSDoc, skip it (unless the existing JSDoc violates documentation.md rules)
- For private/trivial methods, only add JSDoc if the logic is non-obvious (`documentation.md` Section 2)
- Always read the spec artifacts before writing JSDoc — business context must inform the documentation
- Error codes MUST be extracted from the actual implementation, not guessed
- Side effects MUST be verified by reading the implementation code
- If a method has zero business rules or zero side effects, omit those sections entirely

**Quality Checks**
- No `@param` describing TypeScript types (redundant)
- No `This function...` or `Handles...` in summary lines
- Every `@returns` explicitly lists ErrorCode strings for all `Result.fail()` paths
- Business rules are specific domain invariants, not generic descriptions
- Side effects are concrete state mutations
