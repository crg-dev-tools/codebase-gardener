import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Documents that may carry project-specific review/coding rules. Order is
 *  priority order: repo-specific rules should outrank generic guidance. */
const RULE_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".github/pull_request_template.md",
  "docs/architecture.md",
  "docs/design.md",
  "docs/coding-guidelines.md",
  "README.md",
];

/** Cap each doc so a giant README can't dominate the prompt. */
const PER_FILE_CHAR_LIMIT = 8000;

/**
 * Concatenate any project-specific rule documents found at the repo root into
 * a single labeled string for the Claude prompt. Returns "" when none exist.
 */
export function loadProjectRules(root: string): string {
  const parts: string[] = [];
  for (const rel of RULE_FILES) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    try {
      let content = readFileSync(path, "utf8");
      if (content.length > PER_FILE_CHAR_LIMIT) {
        content = content.slice(0, PER_FILE_CHAR_LIMIT) + "\n…(truncated)…";
      }
      parts.push(`--- ${rel} ---\n${content.trim()}`);
    } catch {
      // ignore unreadable files
    }
  }
  return parts.join("\n\n");
}
