import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeAdapter } from "../claude/adapter";
import type { Config } from "../config/schema";
import type { GitClient } from "../git/client";
import { logger } from "../logger";
import { checkEditLimits } from "../safety/guard";
import type { ChangePlan, FileEdit, RepoContext } from "../types";
import { run } from "../util/exec";

export interface ApplyOptions {
  dryRun: boolean;
  baseBranch: string | null;
}

export interface ApplyResult {
  edits: FileEdit[];
  /** True when changes were written, verified, and committed. */
  committed: boolean;
  branch: string;
  changedLines: number;
  /** Populated when the change was aborted by a safety check. */
  aborted?: string;
}

/**
 * Execute a ChangePlan: ask Claude for concrete edits, then (unless dry-run)
 * create a branch, write the files, verify against limits, and commit.
 * Any safety violation rolls the working tree back and aborts.
 */
export async function apply(
  context: RepoContext,
  plan: ChangePlan,
  config: Config,
  git: GitClient,
  adapter: ClaudeAdapter,
  opts: ApplyOptions,
): Promise<ApplyResult> {
  const edits = await adapter.planEdits(context, plan.candidates);

  if (edits.length === 0) {
    return { edits, committed: false, branch: plan.branch, changedLines: 0 };
  }

  if (opts.dryRun) {
    logger.debug("dry-run: not writing files, creating a branch, or committing");
    return { edits, committed: false, branch: plan.branch, changedLines: 0 };
  }

  const editedPaths = edits.map((e) => e.file);

  await git.createBranch(plan.branch);
  try {
    for (const edit of edits) {
      writeFileSync(join(context.root, edit.file), edit.newContent, "utf8");
    }
    await git.add(editedPaths);

    const changedLines = await git.changedLineCount();
    const violations = checkEditLimits(edits, changedLines, config);
    if (violations.length > 0) {
      for (const v of violations) logger.warn(v.message);
      await rollback(git, editedPaths, plan.branch, opts.baseBranch);
      return {
        edits,
        committed: false,
        branch: plan.branch,
        changedLines,
        aborted: violations.map((v) => v.message).join("; "),
      };
    }

    await runVerification(context);

    await git.commit(plan.commitMessage);
    return { edits, committed: true, branch: plan.branch, changedLines };
  } catch (err) {
    await rollback(git, editedPaths, plan.branch, opts.baseBranch);
    throw err;
  }
}

/** Best-effort format/lint/test pass. Failures are surfaced but not fatal;
 *  the resulting PR flags "Manual review required" and CI is the real gate. */
async function runVerification(context: RepoContext): Promise<void> {
  const steps: Array<[string, string | null]> = [
    ["format", context.formatCommand],
    ["lint", context.lintCommand],
    ["test", context.testCommand],
  ];
  for (const [label, command] of steps) {
    if (!command) continue;
    logger.debug(`running ${label}: ${command}`);
    const [bin, ...args] = command.split(" ");
    const res = await run(bin, args, context.root);
    if (res.code !== 0) {
      logger.warn(`${label} reported issues (exit ${res.code}); left for review`);
    }
  }
}

async function rollback(
  git: GitClient,
  paths: string[],
  branch: string,
  baseBranch: string | null,
): Promise<void> {
  try {
    await git.restore(paths);
    if (baseBranch) {
      await git.checkout(baseBranch);
      await git.deleteBranch(branch);
    }
  } catch (err) {
    logger.warn(`rollback incomplete: ${(err as Error).message}`);
  }
}
