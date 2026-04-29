#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { runSync } from "./sync";

function printUsage(): void {
  console.log(`agent-config — Sync .agents/ config to AI tool directories

Usage:
  agent-config sync [--check] [--target <claude|github>]

Options:
  --check       Check-only mode: report differences, exit 1 if out of sync
  --target <t>  Sync only a specific target (defaults to claude)
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  if (command !== "sync") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  let checkOnly = false;
  let target: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--check") {
      checkOnly = true;
    } else if (args[i] === "--target" && i + 1 < args.length) {
      target = args[i + 1];
      i++;
      if (target !== "claude" && target !== "github") {
        console.error(
          `Invalid target: ${target}. Must be "claude" or "github".`
        );
        process.exit(1);
      }
    } else {
      console.error(`Unknown option: ${args[i]}`);
      printUsage();
      process.exit(1);
    }
  }

  // Resolve repo root — works regardless of where the dist/ is located
  // node_modules case: ../../../../../
  // direct run case: ../../../
  let repoRoot = __dirname;
  while (repoRoot !== "/" && !fs.existsSync(path.join(repoRoot, ".agents"))) {
    const parent = path.dirname(repoRoot);
    if (parent === repoRoot) break;
    repoRoot = parent;
  }

  const clean = runSync(repoRoot, checkOnly, target ?? "claude");
  // In sync mode, we fixed any issues — always exit 0.
  // In check mode, exit 1 if dirty so CI can fail.
  process.exit(checkOnly && !clean ? 1 : 0);
}

main();
