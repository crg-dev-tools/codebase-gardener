import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config/schema";
import { logger } from "../logger";
import type { Candidate, RepoContext } from "../types";

/** Char budgets that keep prompts within a sane token range. */
export const SCAN_TOTAL_BUDGET = 120_000;
export const SCAN_PER_FILE = 6_000;
export const APPLY_PER_FILE = 20_000;

export function readFileSafe(root: string, rel: string): string | null {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/** Build a labeled digest of file contents within a total char budget. */
export function buildDigest(
  root: string,
  files: string[],
  totalBudget: number,
  perFile: number,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const rel of files) {
    if (used >= totalBudget) {
      parts.push(
        `… (${files.length - parts.length} more files omitted for size)`,
      );
      break;
    }
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const clipped =
      content.length > perFile
        ? content.slice(0, perFile) + "\n… (truncated) …"
        : content;
    const block = `=== FILE: ${rel} ===\n${clipped}`;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}

/** Build the user prompt for the scan step over an explicit set of files. */
export function buildScanPrompt(
  context: RepoContext,
  config: Config,
  files: string[],
): string {
  const digest = buildDigest(
    context.root,
    files,
    SCAN_TOTAL_BUDGET,
    SCAN_PER_FILE,
  );
  const projectRules = context.projectRules
    ? `Project-specific rules (obey these; they outrank generic guidance):\n${context.projectRules}\n\n`
    : "";

  const prompt = `Repository languages: ${context.languages.join(", ") || "unknown"}.
Allowed rules (only propose candidates in this set): ${config.rules.join(", ")}.
Limits for a single PR: max ${config.limits.max_files_per_pr} files, max ${config.limits.max_changed_lines_per_pr} changed lines.

${projectRules}Below are the repository source files. Identify low-risk maintenance candidates.

${digest}`;
  logger.debug(`scan prompt size: ${prompt.length} chars`);
  return prompt;
}

/**
 * Build the user prompt for the apply step and the list of files whose
 * contents were included (small enough to edit safely).
 */
export function buildApplyPrompt(
  context: RepoContext,
  candidates: Candidate[],
): { prompt: string; targetFiles: string[] } {
  const targetFiles: string[] = [];
  const fileBlocks: string[] = [];
  for (const rel of [...new Set(candidates.map((c) => c.file))]) {
    const content = readFileSafe(context.root, rel);
    if (content === null) {
      logger.warn(`could not read ${rel}; skipping`);
      continue;
    }
    if (content.length > APPLY_PER_FILE) {
      logger.warn(`${rel} is too large for a safe minimal edit; skipping`);
      continue;
    }
    targetFiles.push(rel);
    fileBlocks.push(`=== FILE: ${rel} ===\n${content}`);
  }

  const candidateList = candidates
    .map(
      (c, i) =>
        `${i + 1}. [${c.rule}] ${c.file} — ${c.reason} (risk: ${c.risk}, confidence: ${c.confidence})`,
    )
    .join("\n");

  const projectRules = context.projectRules
    ? `Project-specific rules (obey these):\n${context.projectRules}\n\n`
    : "";

  const prompt = `Apply the following pre-selected low-risk candidates by returning minimal exact-string replacements for each file you change (see the system instructions for the required format).

Candidates:
${candidateList}

${projectRules}Current file contents:

${fileBlocks.join("\n\n")}`;
  logger.debug(`apply prompt size: ${prompt.length} chars`);
  return { prompt, targetFiles };
}
