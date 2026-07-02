import { anyBackendAvailable } from "./claude/adapter";
import type { GitClient } from "./git/client";

export interface PreflightOptions {
  /** Require a clean working tree (used by `run`). */
  requireClean: boolean;
  /** Require a usable Claude backend — CLI login or API key (scan/run). */
  requireClaude: boolean;
  /** Repo root, needed to probe for the Claude Code CLI. */
  cwd: string;
}

export interface PreflightResult {
  ok: boolean;
  problems: string[];
  currentBranch: string | null;
}

/** Verify the environment is in a state where the command can run safely. */
export async function preflight(
  git: GitClient,
  opts: PreflightOptions,
): Promise<PreflightResult> {
  const problems: string[] = [];

  const isRepo = await git.isRepo();
  if (!isRepo) {
    problems.push("not a git repository (run inside a git repo)");
    return { ok: false, problems, currentBranch: null };
  }

  const currentBranch = await git.currentBranch();

  if (opts.requireClean) {
    const clean = await git.isClean();
    if (!clean) {
      problems.push(
        "working tree is not clean; commit or stash your changes first",
      );
    }
  }

  if (opts.requireClaude && !(await anyBackendAvailable(opts.cwd))) {
    problems.push(
      "no Claude backend available: install the Claude Code CLI and log in " +
        "(reuses your claude.ai login), or set ANTHROPIC_API_KEY",
    );
  }

  return { ok: problems.length === 0, problems, currentBranch };
}
