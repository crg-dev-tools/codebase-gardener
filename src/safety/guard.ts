import type { Config } from "../config/schema";
import { logger } from "../logger";
import type { Candidate, FileEdit } from "../types";
import { matchesAny } from "../util/glob";

/** Minimum model confidence for a candidate to be eligible in `run`. */
export const MIN_CONFIDENCE = 0.6;

export interface SafetyViolation {
  message: string;
}

/**
 * Keep only candidates that are safe to act on automatically:
 *  - risk must be low (safe mode)
 *  - rule must be in the configured allow-list
 *  - path must not be excluded
 *  - confidence must clear the threshold
 * Returns the surviving candidates; drops are logged.
 */
export function filterSafeCandidates(
  candidates: Candidate[],
  config: Config,
): Candidate[] {
  const allowed = new Set(config.rules);
  const kept: Candidate[] = [];
  for (const c of candidates) {
    if (c.risk !== "low") {
      logger.debug(`drop ${c.file}: risk ${c.risk} not allowed in safe mode`);
      continue;
    }
    if (!allowed.has(c.rule)) {
      logger.debug(`drop ${c.file}: rule ${c.rule} not in allow-list`);
      continue;
    }
    if (matchesAny(c.file, config.exclude)) {
      logger.debug(`drop ${c.file}: path is excluded`);
      continue;
    }
    if (c.confidence < MIN_CONFIDENCE) {
      logger.debug(`drop ${c.file}: confidence ${c.confidence} below ${MIN_CONFIDENCE}`);
      continue;
    }
    kept.push(c);
  }
  return kept;
}

/**
 * Select the subset of candidates that fits inside one PR's file budget.
 * Candidates are grouped by file; whole files are taken until the budget
 * is reached (never a partial file).
 */
export function selectWithinFileBudget(
  candidates: Candidate[],
  config: Config,
): Candidate[] {
  const maxFiles = config.limits.max_files_per_pr;
  const selected: Candidate[] = [];
  const chosenFiles = new Set<string>();
  for (const c of candidates) {
    if (chosenFiles.has(c.file)) {
      selected.push(c);
      continue;
    }
    if (chosenFiles.size >= maxFiles) continue;
    chosenFiles.add(c.file);
    selected.push(c);
  }
  return selected;
}

/**
 * Verify a produced set of edits + working-tree diff against the config
 * limits. Returns a list of violations (empty means OK).
 */
export function checkEditLimits(
  edits: FileEdit[],
  changedLines: number,
  config: Config,
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const files = new Set(edits.map((e) => e.file));
  if (files.size > config.limits.max_files_per_pr) {
    violations.push({
      message: `edit touches ${files.size} files, over the limit of ${config.limits.max_files_per_pr}`,
    });
  }
  if (changedLines > config.limits.max_changed_lines_per_pr) {
    violations.push({
      message: `edit changes ${changedLines} lines, over the limit of ${config.limits.max_changed_lines_per_pr}`,
    });
  }
  for (const e of edits) {
    if (matchesAny(e.file, config.exclude)) {
      violations.push({ message: `edit targets excluded path ${e.file}` });
    }
  }
  return violations;
}
