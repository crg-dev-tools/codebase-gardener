/** Shared domain types for codebase-gardener. */

export type RiskLevel = "low" | "medium" | "high";

/** A rule identifier the scanner may propose fixes for. */
export type RuleId =
  | "lint_fix"
  | "unused_import"
  | "unused_variable"
  | "remove_debugger"
  | "deprecated_api"
  | "type_narrowing"
  | "small_test_addition"
  | "typo"
  | "stale_docs";

/** A single maintenance-fix candidate surfaced by `scan`. */
export interface Candidate {
  /** Which rule this candidate falls under. */
  rule: RuleId;
  /** Repo-relative path of the file the fix targets. */
  file: string;
  /** One-line human explanation of what would change. */
  reason: string;
  /** Estimated risk of the change. */
  risk: RiskLevel;
  /** Model confidence 0..1 that this is a safe, correct fix. */
  confidence: number;
  /** Short description of the expected diff (no code required). */
  expectedDiff: string;
}

/** A single exact-string replacement within a file. `oldString` must occur
 *  exactly once in the file; only that span changes. */
export interface Replacement {
  oldString: string;
  newString: string;
}

/** A concrete file edit produced during `run`, expressed as minimal string
 *  replacements so unrelated content cannot change. */
export interface FileEdit {
  /** Repo-relative path of the file to edit. */
  file: string;
  /** One or more exact-match replacements to apply, in order. */
  replacements: Replacement[];
  /** One-line explanation of the change for the PR body. */
  summary: string;
}

/** The selected, bounded set of work for a single PR. */
export interface ChangePlan {
  candidates: Candidate[];
  branch: string;
  commitMessage: string;
  /** Human-readable title for the PR. */
  title: string;
}

/** What the repo inspector learned about the target repository. */
export interface RepoContext {
  root: string;
  isGitRepo: boolean;
  defaultBranch: string | null;
  packageManager: "npm" | "yarn" | "pnpm" | null;
  languages: string[];
  lintCommand: string | null;
  testCommand: string | null;
  formatCommand: string | null;
  /** Repo-relative paths of candidate source files (post-exclude). */
  files: string[];
  /** Concatenated project-specific rules (CLAUDE.md, AGENTS.md, ...). */
  projectRules: string;
}
