import type { Config } from "../config/schema";
import type { Candidate, ChangePlan } from "../types";
import { filterSafeCandidates, selectWithinFileBudget } from "../safety/guard";

/** Map a rule to a conventional-commit type + subject. */
function commitInfoFor(rules: Set<string>): {
  type: string;
  subject: string;
} {
  if (rules.has("unused_import"))
    return { type: "chore", subject: "remove unused imports" };
  if (rules.has("lint_fix"))
    return { type: "chore", subject: "fix lint warnings" };
  if (rules.has("deprecated_api"))
    return { type: "refactor", subject: "replace deprecated API usage" };
  if (rules.has("typo")) return { type: "docs", subject: "fix typos" };
  if (rules.has("stale_docs"))
    return { type: "docs", subject: "update stale documentation" };
  if (rules.has("type_narrowing"))
    return { type: "fix", subject: "tighten types" };
  if (rules.has("small_test_addition"))
    return { type: "test", subject: "add small test coverage" };
  return { type: "chore", subject: "small maintenance changes" };
}

/** Date stamp (YYYYMMDD) for branch names. */
function dateStamp(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Turn raw candidates into a single bounded ChangePlan, or null when nothing
 * safe remains. Applies safety filtering and the per-PR file budget.
 */
export function plan(
  candidates: Candidate[],
  config: Config,
  now: Date = new Date(),
): ChangePlan | null {
  const safe = filterSafeCandidates(candidates, config);
  if (safe.length === 0) return null;

  const selected = selectWithinFileBudget(safe, config);
  if (selected.length === 0) return null;

  const rules = new Set(selected.map((c) => c.rule));
  const { type, subject } = commitInfoFor(rules);
  const slug = subject.replace(/\s+/g, "-").toLowerCase();

  return {
    candidates: selected,
    branch: `${config.pr.branch_prefix}${slug}-${dateStamp(now)}`,
    commitMessage: `${type}: ${subject}`,
    title: `${type}: ${subject}`,
  };
}
