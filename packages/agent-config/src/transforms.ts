/**
 * Transform Claude Code command frontmatter into GitHub Copilot prompt frontmatter.
 *
 * Claude Code commands use:  name, description, category, tags
 * GitHub Copilot prompts use: description only
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

/** Strip name, category, tags from YAML frontmatter, keep only description. */
export function transformCommandToPrompt(content: string): string {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return content;
  }

  const frontmatterBody = match[1];
  const descriptionLine = frontmatterBody
    .split("\n")
    .find((line) => line.startsWith("description:"));

  if (!descriptionLine) {
    return content.slice(match[0].length).replace(/^\n+/, "");
  }

  const body = content.slice(match[0].length).replace(/^\n+/, "");
  return `---\n${descriptionLine}\n---\n\n${body}`;
}

/** Compute the GitHub Copilot prompt filename from a Claude Code command filename. */
export function commandNameToPromptName(commandFileName: string): string {
  const base = commandFileName.replace(/\.md$/, "");
  return `opsx-${base}.prompt.md`;
}
