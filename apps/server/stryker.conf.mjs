// @ts-check
/**
 * StrykerJS configuration for the UniHub server.
 *
 * Scope rationale: mutation testing is expensive, so we only mutate code that
 * carries a business invariant (see docs/blueprint). Mutating DTOs, Nest
 * modules, barrels and config yields mostly equivalent mutants and burns CI
 * minutes for no signal.
 *
 * Run modes:
 *   pnpm stryker           full invariant scope, incremental
 *   pnpm stryker:full      every mutable source file, no incremental reuse
 *   npx stryker run --mutate "<paths>"   PR-scoped run (see CI workflow)
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  testRunner: 'jest',

  // Stryker auto-discovers plugins by globbing node_modules/@stryker-mutator/*.
  // pnpm's non-flat node_modules defeats that glob, so the runner must be
  // declared explicitly or Stryker fails with "no TestRunner plugins were loaded".
  plugins: ['@stryker-mutator/jest-runner'],

  // Unit specs only. test/e2e and test/integration boot AppModule and are both
  // slower and less aligned with the file under mutation.
  jest: {
    projectType: 'custom',
    configFile: 'package.json',
    enableFindRelatedTests: true,
  },

  // Biggest single speedup: run only the tests that touched the mutated line.
  coverageAnalysis: 'perTest',

  // pnpm stores dependencies as relative symlinks into the workspace root
  // .pnpm store. Stryker's default sandbox sits at a different directory depth,
  // which breaks those symlinks. Mutating in place avoids the problem entirely.
  // Requires a clean working tree; CI runners are ephemeral so this is safe.
  inPlace: true,

  mutate: [
    // I1 - no overselling (optimistic locking, seat lock)
    'src/modules/booking/services/**/*.ts',
    'src/modules/booking/mechanics/**/*.ts',
    'src/modules/booking/repositories/**/*.ts',

    // I2 - no double charge (idempotency), I3 - payment fault isolation
    'src/modules/payment/services/**/*.ts',
    'src/modules/payment/mechanics/**/*.ts',
    'src/modules/payment/guards/**/*.ts',
    'src/modules/payment/repositories/**/*.ts',

    // I4 - atomic rate limiting with fail-open
    'src/modules/rate-limit/services/**/*.ts',
    'src/modules/rate-limit/guards/**/*.ts',

    // I5 - RBAC and IDOR prevention
    'src/modules/iam/guards/**/*.ts',

    // I6 - idempotent offline check-in
    'src/modules/checkin/services/**/*.ts',

    // I7 - idempotent CSV import
    'src/modules/csv-sync/services/student-sync.service.ts',

    // I8 - cache is a pre-filter, never the enforcement point
    'src/modules/catalog/services/seat-counter.service.ts',

    // Exclusions: no behaviour to mutate, or mutants are equivalent by construction.
    '!src/**/*.spec.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.module.ts',
    '!src/**/*.type.ts',
    '!src/**/index.ts',
  ],

  // Reuses verdicts from the previous run and only re-tests what changed.
  // CI restores reports/stryker-incremental.json from cache before running.
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',

  // 24 of 55 spec files call Date.now()/new Date() without fake timers. Under
  // Stryker's parallel load these get slower, so give real work room to finish
  // before we call it a Timeout and mis-score it as killed.
  timeoutMS: 60000,
  timeoutFactor: 2.5,

  // Overridden per lane in CI (GitHub-hosted runners have 2 vCPU).
  concurrency: 4,

  // These mutators produce a high share of equivalent or trivial mutants
  // relative to the assertions they motivate.
  mutator: {
    excludedMutations: ['StringLiteral', 'ObjectLiteral', 'ArrayDeclaration'],
  },

  reporters: ['html', 'json', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/report.json' },

  // Reporting thresholds only. break: null means Stryker never fails the build.
  // Test quality is surfaced in the PR comment, not enforced as a merge gate.
  thresholds: { high: 80, low: 60, break: null },

  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
