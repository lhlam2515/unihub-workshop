#!/usr/bin/env node
/**
 * Turns a StrykerJS JSON report into two artifacts:
 *
 *   reports/mutation/pr-comment.md  - short summary posted on the PR
 *   reports/mutation/ai-bundle.md   - survivor dossier an AI agent can triage
 *   reports/mutation/summary.json   - machine-readable metrics for the workflow
 *
 * Deterministic and dependency-free on purpose: this runs on every PR and must
 * never consume API quota, never vary between runs, and never fail the build.
 * The AI lane is a separate, opt-in workflow that consumes ai-bundle.md.
 *
 * Usage: node scripts/mutation-ai-bundle.mjs [--report <path>] [--max-survivors N]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { argv, exit } from 'node:process';

const SERVER_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

const REPORT_PATH = resolve(SERVER_ROOT, arg('--report', 'reports/mutation/report.json'));
const OUT_DIR = dirname(REPORT_PATH);
const MAX_SURVIVORS = Number(arg('--max-survivors', '40'));

/**
 * Business invariants from docs/blueprint. A surviving mutant inside one of
 * these files means the test suite does not detect a violation of a rule the
 * system is supposed to guarantee - that is the finding worth a developer's
 * attention, as opposed to an untested log message.
 */
const INVARIANTS = [
  {
    id: 'I1',
    title: 'No overselling of seats',
    rule: 'Two students must never both receive the last seat. Enforced by optimistic locking: UPDATE ... WHERE version = :v AND seats_available > 0, inside an ACID transaction with a retry ceiling.',
    match: /modules\/booking\/(services|mechanics|repositories)\//,
  },
  {
    id: 'I2',
    title: 'No double charge',
    rule: 'A client retrying N times must be charged once. Idempotency key is 3-state (claim -> locked 30s -> completed), forwarded to the gateway, backed by UNIQUE + INSERT ... ON CONFLICT DO NOTHING.',
    match: /modules\/payment\/(mechanics\/idempotency|repositories\/idempotency|services\/payment-reconciliation)/,
  },
  {
    id: 'I3',
    title: 'Payment gateway fault isolation',
    rule: 'When the circuit breaker is OPEN the server returns 503 immediately without calling the gateway. HALF_OPEN allows exactly one probe (atomic CAS). A cached idempotent response must be returned before circuit-breaker logic runs.',
    match: /modules\/payment\/(mechanics\/circuit-breaker|guards|services\/payments)/,
  },
  {
    id: 'I4',
    title: 'Atomic rate limiting, fail-open',
    rule: 'Increment and check must be atomic (MULTI/EXEC over ZREMRANGEBYSCORE + ZADD + ZCARD). If Redis is down the limiter fails OPEN, because optimistic locking still prevents overselling.',
    match: /modules\/rate-limit\//,
  },
  {
    id: 'I5',
    title: 'RBAC and IDOR prevention',
    rule: 'Three layers: route-to-role, data ownership, and a deliberate 403-vs-404 distinction. A student must not read or pay for another student registration, even by calling the API directly.',
    match: /modules\/iam\/guards\//,
  },
  {
    id: 'I6',
    title: 'Idempotent offline check-in',
    rule: 'Two staff scanning the same QR offline is an expected race, not an error. Sync must resolve duplicates and tolerate device clock skew.',
    match: /modules\/checkin\/services\//,
  },
  {
    id: 'I7',
    title: 'Idempotent CSV import',
    rule: 'Re-running the same file N times yields an identical result. Invalid rows are quarantined into student_sync_errors without stopping the pipeline.',
    match: /modules\/csv-sync\//,
  },
  {
    id: 'I8',
    title: 'Cache is a pre-filter, not enforcement',
    rule: 'Redis seats_available is a pre-filter with a 10s TTL. Never DECR it. PostgreSQL optimistic locking is the enforcement point.',
    match: /modules\/catalog\/services\/seat-counter/,
  },
];

/**
 * Mutators whose survival most often points at a missing assertion rather than
 * an equivalent mutant. Used to rank which survivors a developer sees first.
 */
const HIGH_SIGNAL_MUTATORS = new Set([
  'ConditionalExpression',
  'EqualityOperator',
  'LogicalOperator',
  'BooleanLiteral',
  'ArithmeticOperator',
  'UpdateOperator',
  'OptionalChaining',
]);

function invariantFor(filePath) {
  return INVARIANTS.find((inv) => inv.match.test(filePath)) ?? null;
}

function pct(n, d) {
  return d === 0 ? null : (100 * n) / d;
}

function fmt(n) {
  return n === null ? 'n/a' : `${n.toFixed(2)}%`;
}

function tally(mutants) {
  const t = { Killed: 0, Survived: 0, Timeout: 0, NoCoverage: 0, CompileError: 0, RuntimeError: 0, Ignored: 0 };
  for (const m of mutants) t[m.status] = (t[m.status] ?? 0) + 1;
  return t;
}

/** Stryker's own definition: killed / (killed + survived + timeout). */
function score(t) {
  return pct(t.Killed, t.Killed + t.Survived + t.Timeout);
}

/** Harsher variant that counts never-executed mutants as failures. */
function scoreWithNoCoverage(t) {
  return pct(t.Killed, t.Killed + t.Survived + t.Timeout + t.NoCoverage);
}

function readSourceWindow(filePath, line, before = 6, after = 4) {
  const abs = resolve(SERVER_ROOT, filePath);
  if (!existsSync(abs)) return null;
  const lines = readFileSync(abs, 'utf8').split('\n');
  const from = Math.max(0, line - 1 - before);
  const to = Math.min(lines.length, line + after);
  return lines
    .slice(from, to)
    .map((text, i) => {
      const no = from + i + 1;
      return `${String(no).padStart(4)}${no === line ? ' >' : '  '} ${text}`;
    })
    .join('\n');
}

/** The unit spec sitting next to the mutated file, if there is one. */
function specFor(filePath) {
  const candidate = filePath.replace(/\.ts$/, '.spec.ts');
  return existsSync(resolve(SERVER_ROOT, candidate)) ? candidate : null;
}

function main() {
  if (!existsSync(REPORT_PATH)) {
    console.error(`No Stryker report at ${REPORT_PATH}. Run "pnpm stryker" first.`);
    exit(1);
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
  const files = Object.entries(report.files ?? {});
  if (files.length === 0) {
    console.error('Report contains no files.');
    exit(1);
  }

  const allMutants = files.flatMap(([path, data]) =>
    data.mutants.map((m) => ({ ...m, file: path })),
  );
  const overall = tally(allMutants);

  // Per-file rollup, worst score first.
  const perFile = files
    .map(([path, data]) => {
      const t = tally(data.mutants);
      return {
        path,
        invariant: invariantFor(path),
        total: data.mutants.length,
        ...t,
        score: score(t),
        scoreStrict: scoreWithNoCoverage(t),
      };
    })
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1));

  // Survivors ranked: invariant-carrying first, then high-signal mutators.
  const survivors = allMutants
    .filter((m) => m.status === 'Survived' || m.status === 'NoCoverage')
    .map((m) => ({
      ...m,
      invariant: invariantFor(m.file),
      highSignal: HIGH_SIGNAL_MUTATORS.has(m.mutatorName),
    }))
    .sort((a, b) => {
      const w = (m) => (m.invariant ? 2 : 0) + (m.highSignal ? 1 : 0) + (m.status === 'Survived' ? 1 : 0);
      return w(b) - w(a);
    });

  const shown = survivors.slice(0, MAX_SURVIVORS);

  const summary = {
    generatedAt: new Date().toISOString(),
    mutants: overall,
    total: allMutants.length,
    mutationScore: score(overall),
    mutationScoreWithNoCoverage: scoreWithNoCoverage(overall),
    filesMutated: files.length,
    survivorsTotal: survivors.length,
    survivorsInInvariantScope: survivors.filter((s) => s.invariant).length,
    invariantsTouched: [...new Set(survivors.filter((s) => s.invariant).map((s) => s.invariant.id))].sort(),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

  // ---------------------------------------------------------------- PR comment
  const c = [];
  c.push('## Mutation testing report');
  c.push('');
  c.push(`**Mutation score: ${fmt(summary.mutationScore)}** on ${summary.total} mutants across ${summary.filesMutated} files.`);
  c.push('');
  c.push('| Killed | Survived | Timeout | No coverage | Errors |');
  c.push('|---:|---:|---:|---:|---:|');
  c.push(
    `| ${overall.Killed} | ${overall.Survived} | ${overall.Timeout} | ${overall.NoCoverage} | ${overall.CompileError + overall.RuntimeError} |`,
  );
  c.push('');
  c.push(
    `Counting never-executed mutants as failures the score is ${fmt(summary.mutationScoreWithNoCoverage)}. ` +
      'That is the number to watch: a high Stryker score with a large no-coverage bucket means whole branches are untested, not well tested.',
  );
  c.push('');

  if (summary.survivorsInInvariantScope > 0) {
    c.push(
      `### ${summary.survivorsInInvariantScope} survivor(s) sit on a business invariant (${summary.invariantsTouched.join(', ')})`,
    );
    c.push('');
    c.push('| Invariant | File | Line | Mutator | Status |');
    c.push('|---|---|---:|---|---|');
    for (const s of shown.filter((s) => s.invariant).slice(0, 15)) {
      c.push(
        `| ${s.invariant.id} | \`${basename(s.file)}\` | ${s.location.start.line} | ${s.mutatorName} | ${s.status} |`,
      );
    }
    c.push('');
    c.push('A surviving mutant here means the suite does not detect a violation of a rule the system promises to hold.');
  } else {
    c.push('### No survivor lands on a business invariant.');
  }
  c.push('');

  c.push('<details><summary>Per-file breakdown</summary>');
  c.push('');
  c.push('| File | Score | Total | Killed | Survived | No cov |');
  c.push('|---|---:|---:|---:|---:|---:|');
  for (const f of perFile) {
    c.push(
      `| \`${f.path.replace('src/modules/', '')}\` | ${fmt(f.score)} | ${f.total} | ${f.Killed} | ${f.Survived} | ${f.NoCoverage} |`,
    );
  }
  c.push('');
  c.push('</details>');
  c.push('');
  c.push(
    '_Reporting only - this job never blocks a merge. Download the `mutation-report` artifact for the HTML view, ' +
      'or add the `mutation:ai-review` label to have an agent triage the survivors._',
  );

  writeFileSync(join(OUT_DIR, 'pr-comment.md'), `${c.join('\n')}\n`);

  // ---------------------------------------------------------------- AI bundle
  const b = [];
  b.push('# Surviving mutant dossier');
  b.push('');
  b.push(
    `Generated ${summary.generatedAt} from StrykerJS. ${summary.survivorsTotal} survivors total, ` +
      `${shown.length} included below, ranked by business impact.`,
  );
  b.push('');
  b.push('## Your task');
  b.push('');
  b.push('For each mutant below, decide exactly one verdict:');
  b.push('');
  b.push('1. **EQUIVALENT** - the mutated code is semantically identical to the original, so no test can ever kill it. Justify why; do not propose a test.');
  b.push('2. **MISSING ASSERTION** - existing tests execute this line but assert nothing that distinguishes the mutant. Propose the assertion to add, naming the exact spec file and `it()` block.');
  b.push('3. **MISSING TEST** - no test exercises this path. Propose a new `it()` with arrange/act/assert.');
  b.push('');
  b.push('Rules you must follow:');
  b.push('');
  b.push('- Every proposed test must PASS on the original code and FAIL on the mutant. If you cannot argue both, mark the mutant EQUIVALENT instead of guessing.');
  b.push('- Do not assert implementation details (call order, private state). Assert observable behaviour.');
  b.push('- Never assert the mutant\'s own output as the expected value. The invariant text below is the oracle, not the code.');
  b.push('- Match the existing spec style: NestJS `Test.createTestingModule`, mocked providers, no real Postgres or Redis.');
  b.push('- Prioritise mutants attached to an invariant. A survivor on a log line is not worth a test.');
  b.push('');
  b.push('Output a Markdown table (Mutant ID | Verdict | Reason) followed by the proposed test code per mutant. Nothing you produce is merged without a human running it against the original and the mutant.');
  b.push('');
  b.push('---');
  b.push('');

  for (const s of shown) {
    b.push(`## Mutant #${s.id} - ${s.mutatorName} (${s.status})`);
    b.push('');
    b.push(`- **File:** \`${s.file}\` line ${s.location.start.line}`);
    if (s.invariant) {
      b.push(`- **Invariant ${s.invariant.id} - ${s.invariant.title}**`);
      b.push(`  > ${s.invariant.rule}`);
    } else {
      b.push('- **Invariant:** none mapped. Justify whether a test is worth writing at all.');
    }
    const spec = specFor(s.file);
    b.push(`- **Existing spec:** ${spec ? `\`${spec}\`` : 'none - this file has no unit spec'}`);
    b.push(`- **Mutation applied:** \`${s.replacement ?? '(not recorded)'}\``);
    if (s.statusReason) b.push(`- **Status reason:** ${s.statusReason}`);
    b.push('');
    const src = readSourceWindow(s.file, s.location.start.line);
    if (src) {
      b.push('```ts');
      b.push(src);
      b.push('```');
      b.push('');
    }
  }

  writeFileSync(join(OUT_DIR, 'ai-bundle.md'), `${b.join('\n')}\n`);

  console.log(
    [
      `Mutation score        : ${fmt(summary.mutationScore)}`,
      `Score incl. no-cov    : ${fmt(summary.mutationScoreWithNoCoverage)}`,
      `Mutants               : ${summary.total} (killed ${overall.Killed}, survived ${overall.Survived}, no-cov ${overall.NoCoverage}, timeout ${overall.Timeout})`,
      `Survivors on invariant: ${summary.survivorsInInvariantScope} (${summary.invariantsTouched.join(', ') || 'none'})`,
      '',
      `Wrote ${join(OUT_DIR, 'pr-comment.md')}`,
      `Wrote ${join(OUT_DIR, 'ai-bundle.md')}`,
      `Wrote ${join(OUT_DIR, 'summary.json')}`,
    ].join('\n'),
  );
}

main();
