#!/usr/bin/env node
/**
 * Validation gate for an AI-proposed test.
 *
 * An LLM-written assertion can be plausible and still worthless. Three known
 * failure modes: it asserts a value that happens to match the mutant's output,
 * it asserts an implementation detail, or it treats the buggy behaviour as the
 * oracle. All three produce a green test that kills nothing.
 *
 * The only reliable check is behavioural, and it has two directions:
 *
 *   1. The test PASSES on the original program.        (it is not simply broken)
 *   2. The test FAILS on the mutated program.          (it actually detects the bug)
 *
 * This script automates both. Direction 1 is a plain Jest run. Direction 2 is a
 * Stryker run over the target file, checking that the mutant at the target line
 * comes back Killed rather than Survived.
 *
 * Note on scope: Stryker's `--mutate file:line-line` range did not reliably
 * narrow the run in this repo (verified 2026-08-03: it still produced all 27
 * mutants of the target file). So we mutate the whole file and filter the
 * report by line ourselves. Slower, but it does not depend on undocumented
 * range behaviour.
 *
 * Usage:
 *   node scripts/mutation-validate.mjs --file src/modules/x/y.service.ts --line 109
 *   node scripts/mutation-validate.mjs --file src/... --line 109 --mutator ConditionalExpression
 *
 * Exit codes: 0 gate passed, 1 gate failed, 2 usage or setup error.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { argv, exit } from 'node:process';

const SERVER_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

const targetFile = arg('--file');
const targetLine = Number(arg('--line', '0'));
const targetMutator = arg('--mutator');

if (!targetFile || !targetLine) {
  console.error('Usage: mutation-validate.mjs --file <src/...ts> --line <n> [--mutator <name>]');
  exit(2);
}
if (!existsSync(resolve(SERVER_ROOT, targetFile))) {
  console.error(`File not found: ${targetFile}`);
  exit(2);
}

const specFile = targetFile.replace(/\.ts$/, '.spec.ts');
const hasSpec = existsSync(resolve(SERVER_ROOT, specFile));

function run(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: SERVER_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function section(title) {
  console.log(`\n${'='.repeat(64)}\n${title}\n${'='.repeat(64)}`);
}

// ---------------------------------------------------------- direction 1 of 2
section('Step 1/2  Test must PASS on the original program');

if (!hasSpec) {
  console.error(`No spec file at ${specFile}.`);
  console.error('Write the test first, then run this gate.');
  exit(2);
}

try {
  run('npx', ['jest', '--silent', '--testPathPatterns', specFile]);
  console.log(`PASS  ${specFile} is green against unmutated source.`);
} catch (err) {
  console.error(`FAIL  ${specFile} does not pass on the original program.`);
  console.error('A test that fails here is broken, not strict. Fix it before checking mutants.');
  console.error(String(err.stdout ?? '').slice(-3000));
  exit(1);
}

// ---------------------------------------------------------- direction 2 of 2
section('Step 2/2  Same test must FAIL on the mutant (mutant must be Killed)');

console.log(`Mutating ${targetFile} (whole file, filtered to line ${targetLine} below)...`);

try {
  run('npx', [
    'stryker',
    'run',
    '--mutate',
    targetFile,
    '--concurrency',
    arg('--concurrency', '4'),
    '--force',
    '--reporters',
    'json',
  ]);
} catch (err) {
  // Stryker exits non-zero on a threshold break; the report is still written.
  console.log('(Stryker exited non-zero; reading the report anyway.)');
}

const reportPath = resolve(SERVER_ROOT, 'reports/mutation/report.json');
if (!existsSync(reportPath)) {
  console.error('Stryker produced no report.');
  exit(2);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const fileEntry = Object.entries(report.files ?? {}).find(([p]) => p === targetFile || p.endsWith(targetFile));

if (!fileEntry) {
  console.error(`Report contains no entry for ${targetFile}.`);
  exit(2);
}

const atLine = fileEntry[1].mutants.filter((m) => {
  const inRange = m.location.start.line <= targetLine && m.location.end.line >= targetLine;
  return inRange && (!targetMutator || m.mutatorName === targetMutator);
});

if (atLine.length === 0) {
  console.error(`No mutant found at line ${targetLine}${targetMutator ? ` for mutator ${targetMutator}` : ''}.`);
  console.error('Check the line number against the dossier - it may have shifted since the report was generated.');
  exit(2);
}

console.log('');
console.log('| Mutator | Lines | Status |');
console.log('|---|---|---|');
for (const m of atLine) {
  console.log(`| ${m.mutatorName} | ${m.location.start.line}-${m.location.end.line} | ${m.status} |`);
}

const notKilled = atLine.filter((m) => m.status !== 'Killed' && m.status !== 'Timeout');
const ignored = atLine.filter((m) => m.status === 'Ignored');

section('Verdict');

if (ignored.length === atLine.length) {
  console.error('INCONCLUSIVE  Every mutant at this line is Ignored by the mutator exclusion list.');
  console.error('Nothing was actually tested. Pick a different mutant or adjust excludedMutations.');
  exit(2);
}

if (notKilled.length > 0) {
  console.error(`REJECTED  ${notKilled.length} of ${atLine.length} mutant(s) at line ${targetLine} still survive.`);
  console.error('');
  console.error('The test passes on the original and passes on the mutant, so it distinguishes');
  console.error('nothing. Either the assertion targets the wrong observable, or this mutant is');
  console.error('equivalent and no test can kill it. Decide which before writing more assertions.');
  exit(1);
}

console.log(`ACCEPTED  All ${atLine.length} mutant(s) at line ${targetLine} are Killed.`);
console.log('');
console.log('The test passes on the original and fails on the mutant. It has real detection power.');
exit(0);
