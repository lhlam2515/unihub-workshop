import * as fs from "node:fs";
import * as path from "node:path";
import {
  transformCommandToPrompt,
  commandNameToPromptName,
} from "./transforms";

interface Mapping {
  /** Target tool name. */
  target: "claude" | "github";
  /** Source root relative to repo root (e.g., ".agents/commands/opsx") */
  sourceDir: string;
  /** Target root relative to repo root (e.g., ".claude/commands/opsx") */
  targetDir: string;
  /** Source glob pattern (e.g., "*.md") */
  sourceGlob: string;
  /** Transform function: (content, sourceFileName) => { content, targetFileName } */
  transform: (
    content: string,
    sourceName: string
  ) => { content: string; targetFileName: string } | null;
  /**
   * Whether to recursively copy directory trees (for skills/).
   * When true, sourceGlob is ignored — all files under sourceDir are matched.
   */
  recursive: boolean;
}

interface SyncReport {
  created: string[];
  updated: string[];
  removed: string[];
  dirty: string[];
}

function identityTransform(content: string, sourceName: string) {
  return { content, targetFileName: sourceName };
}

function githubPromptTransform(content: string, sourceName: string) {
  const transformed = transformCommandToPrompt(content);
  const targetFileName = commandNameToPromptName(sourceName);
  return { content: transformed, targetFileName };
}

/** Define all sync mappings from .agents/ → tool directories. */
function getMappings(): Mapping[] {
  return [
    // commands → .claude/commands/ (direct copy)
    {
      target: "claude",
      sourceDir: ".agents/commands/opsx",
      targetDir: ".claude/commands/opsx",
      sourceGlob: "*.md",
      transform: identityTransform,
      recursive: false,
    },
    // commands → .github/prompts/ (transform frontmatter)
    {
      target: "github",
      sourceDir: ".agents/commands/opsx",
      targetDir: ".github/prompts",
      sourceGlob: "*.md",
      transform: githubPromptTransform,
      recursive: false,
    },
    // rules → .claude/rules/ (direct copy)
    {
      target: "claude",
      sourceDir: ".agents/rules",
      targetDir: ".claude/rules",
      sourceGlob: "*.md",
      transform: identityTransform,
      recursive: false,
    },
    // skills → .claude/skills/ (recursive directory copy)
    {
      target: "claude",
      sourceDir: ".agents/skills",
      targetDir: ".claude/skills",
      sourceGlob: "**/*",
      transform: identityTransform,
      recursive: true,
    },
    // skills → .github/skills/ (recursive directory copy)
    {
      target: "github",
      sourceDir: ".agents/skills",
      targetDir: ".github/skills",
      sourceGlob: "**/*",
      transform: identityTransform,
      recursive: true,
    },
  ];
}

function isTargetConfigured(
  repoRoot: string,
  target: "claude" | "github"
): boolean {
  if (target === "claude") {
    return (
      fs.existsSync(path.join(repoRoot, ".claude", "settings.json")) ||
      fs.existsSync(path.join(repoRoot, ".claude", "settings.local.json")) ||
      fs.existsSync(path.join(repoRoot, ".claude"))
    );
  }

  return (
    fs.existsSync(path.join(repoRoot, ".github", "prompts")) ||
    fs.existsSync(path.join(repoRoot, ".github", "skills"))
  );
}

/** List all source files matching a mapping. Returns paths relative to sourceDir. */
function listSourceFiles(repoRoot: string, mapping: Mapping): string[] {
  const srcDir = path.join(repoRoot, mapping.sourceDir);

  if (!fs.existsSync(srcDir)) return [];

  if (mapping.recursive) {
    return walkDir(srcDir).map((f) => path.relative(srcDir, f));
  }

  // Non-recursive: only match glob pattern in the source directory
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  const pattern = globToRegex(mapping.sourceGlob);
  return entries
    .filter((e) => e.isFile() && pattern.test(e.name))
    .map((e) => e.name);
}

/** Recursively walk a directory, returning all file paths (absolute). */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

/** Simple glob-to-regex: only supports * and **. */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** List all target files currently in the target directory. Returns paths relative to targetDir. */
function listTargetFiles(repoRoot: string, mapping: Mapping): string[] {
  const tgtDir = path.join(repoRoot, mapping.targetDir);
  if (!fs.existsSync(tgtDir)) return [];
  return walkDir(tgtDir).map((f) => path.relative(tgtDir, f));
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function runSync(
  repoRoot: string,
  checkOnly: boolean,
  targetFilter?: string
): boolean {
  const activeTarget = (targetFilter ?? "claude") as "claude" | "github";

  if (!isTargetConfigured(repoRoot, activeTarget)) {
    console.log(
      `[agent-config] Skipping ${activeTarget} sync — target is not configured.`
    );
    return true;
  }

  const mappings = getMappings().filter((m) => {
    return m.target === activeTarget;
  });

  const report: SyncReport = {
    created: [],
    updated: [],
    removed: [],
    dirty: [],
  };
  let clean = true;

  for (const mapping of mappings) {
    const srcDir = path.join(repoRoot, mapping.sourceDir);
    const tgtDir = path.join(repoRoot, mapping.targetDir);

    // Build set of expected target files
    const sourceFiles = listSourceFiles(repoRoot, mapping);
    const expectedTargets = new Set<string>();

    for (const srcFile of sourceFiles) {
      const srcPath = path.join(srcDir, srcFile);
      const rawContent = fs.readFileSync(srcPath);
      const result = mapping.transform(rawContent.toString(), srcFile);

      if (!result) continue;

      const tgtPath = path.join(tgtDir, result.targetFileName);
      const relTgtPath = path.relative(repoRoot, tgtPath);
      expectedTargets.add(result.targetFileName);

      const newContent = Buffer.from(result.content);

      if (fs.existsSync(tgtPath)) {
        const existing = fs.readFileSync(tgtPath);
        if (!existing.equals(newContent)) {
          report.dirty.push(relTgtPath);
          clean = false;
          if (!checkOnly) {
            fs.writeFileSync(tgtPath, newContent);
            report.updated.push(relTgtPath);
          }
        }
      } else {
        report.dirty.push(relTgtPath);
        clean = false;
        if (!checkOnly) {
          ensureDir(tgtPath);
          fs.writeFileSync(tgtPath, newContent);
          report.created.push(relTgtPath);
        }
      }
    }

    // Detect stale target files (exist in target but no matching source)
    const existingTargets = listTargetFiles(repoRoot, mapping);
    for (const tgtFile of existingTargets) {
      if (!expectedTargets.has(tgtFile)) {
        const tgtPath = path.join(tgtDir, tgtFile);
        const relTgtPath = path.relative(repoRoot, tgtPath);
        report.dirty.push(relTgtPath);
        clean = false;
        if (!checkOnly) {
          fs.rmSync(tgtPath);
          report.removed.push(relTgtPath);
        }
      }
    }
  }

  if (checkOnly) {
    if (!clean) {
      console.log("[agent-config] Check failed — out of sync:");
      for (const f of report.dirty) {
        console.log(`  ${f}`);
      }
      console.log("[agent-config] Run `pnpm agent-config:sync` to fix.");
    } else {
      console.log("[agent-config] All synced.");
    }
  } else {
    const total =
      report.created.length + report.updated.length + report.removed.length;
    if (total === 0) {
      console.log("[agent-config] Already up to date.");
    } else {
      if (report.created.length > 0) {
        console.log(`Created ${report.created.length} file(s):`);
        for (const f of report.created) console.log(`  + ${f}`);
      }
      if (report.updated.length > 0) {
        console.log(`Updated ${report.updated.length} file(s):`);
        for (const f of report.updated) console.log(`  ~ ${f}`);
      }
      if (report.removed.length > 0) {
        console.log(`Removed ${report.removed.length} stale file(s):`);
        for (const f of report.removed) console.log(`  - ${f}`);
      }
    }
  }

  return clean;
}
