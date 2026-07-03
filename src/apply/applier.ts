import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeAdapter } from "../claude/adapter";
import type { Config } from "../config/schema";
import type { GitClient } from "../git/client";
import { logger } from "../logger";
import { checkContentIntegrity, checkEditLimits } from "../safety/guard";
import type { ChangePlan, FileEdit, RepoContext } from "../types";
import { run } from "../util/exec";
import { applyReplacements } from "./patch";

export interface ApplyOptions {
  dryRun: boolean;
  baseBranch: string | null;
}

/** Outcome of a single verification step. */
export type CheckState = "passed" | "failed" | "skipped";

export interface VerificationResult {
  lint: CheckState;
  test: CheckState;
}

export interface ApplyResult {
  edits: FileEdit[];
  /** True when changes were written, verified, and committed. */
  committed: boolean;
  branch: string;
  changedLines: number;
  verification: VerificationResult;
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
  const skipped: VerificationResult = { lint: "skipped", test: "skipped" };
  const edits = await adapter.planEdits(context, plan.candidates);

  if (edits.length === 0) {
    return {
      edits,
      committed: false,
      branch: plan.branch,
      changedLines: 0,
      verification: skipped,
    };
  }

  if (opts.dryRun) {
    logger.debug("dry-run: not writing files, creating a branch, or committing");
    return {
      edits,
      committed: false,
      branch: plan.branch,
      changedLines: 0,
      verification: skipped,
    };
  }

  // Resolve each edit's replacements into concrete file content. An edit whose
  // replacements don't match uniquely is skipped (never partially applied).
  const resolved: Array<{
    file: string;
    original: string;
    newContent: string;
    edit: FileEdit;
  }> = [];
  for (const edit of edits) {
    let original: string;
    try {
      original = readFileSync(join(context.root, edit.file), "utf8");
    } catch {
      logger.warn(`skipping ${edit.file}: cannot read file`);
      continue;
    }
    const result = applyReplacements(original, edit.replacements);
    if (!result.ok) {
      logger.warn(`skipping ${edit.file}: ${result.error}`);
      continue;
    }
    if (result.content === original) {
      logger.debug(`skipping ${edit.file}: replacements produced no change`);
      continue;
    }
    resolved.push({ file: edit.file, original, newContent: result.content, edit });
  }

  if (resolved.length === 0) {
    logger.warn("no edits applied cleanly");
    return {
      edits,
      committed: false,
      branch: plan.branch,
      changedLines: 0,
      verification: skipped,
    };
  }

  const appliedEdits = resolved.map((r) => r.edit);
  const editedPaths = resolved.map((r) => r.file);
  const integrityItems = resolved.map((r) => ({
    file: r.file,
    original: r.original,
    newContent: r.newContent,
  }));

  const branch = await resolveBranchName(git, plan.branch);

  await git.createBranch(branch);
  try {
    for (const r of resolved) {
      writeFileSync(join(context.root, r.file), r.newContent, "utf8");
    }
    await git.add(editedPaths);

    const changedLines = await git.changedLineCount();
    const violations = [
      ...checkEditLimits(appliedEdits, changedLines, config),
      ...checkContentIntegrity(integrityItems),
    ];
    if (violations.length > 0) {
      for (const v of violations) logger.warn(v.message);
      await rollback(git, branch, opts.baseBranch);
      return {
        edits: appliedEdits,
        committed: false,
        branch,
        changedLines,
        verification: skipped,
        aborted: violations.map((v) => v.message).join("; "),
      };
    }

    // Run format/lint/test AFTER the limit checks; a formatter may rewrite the
    // files, so re-stage before committing to include its changes.
    const verification = await runVerification(context);
    await git.add(editedPaths);

    await git.commit(plan.commitMessage);
    return {
      edits: appliedEdits,
      committed: true,
      branch,
      changedLines,
      verification,
    };
  } catch (err) {
    await rollback(git, branch, opts.baseBranch);
    throw err;
  }
}

/** Find a branch name not already used locally or on origin, suffixing -2,
 *  -3, … when the base name is taken (so same-day re-runs don't collide). */
async function resolveBranchName(
  git: GitClient,
  base: string,
): Promise<string> {
  if (!(await git.branchExists(base))) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!(await git.branchExists(candidate))) return candidate;
  }
  throw new Error(`could not find a free branch name based on ${base}`);
}

/** Best-effort lint/test pass (and formatter, whose output is re-staged by the
 *  caller). Failures are surfaced but not fatal; CI is the real gate. Returns
 *  the pass/fail/skip state of lint and test for the PR body. */
async function runVerification(
  context: RepoContext,
): Promise<VerificationResult> {
  // Formatter first so lint/test see formatted code; its result isn't reported.
  if (context.formatCommand) await runStep("format", context.formatCommand, context);
  return {
    lint: await runStep("lint", context.lintCommand, context),
    test: await runStep("test", context.testCommand, context),
  };
}

async function runStep(
  label: string,
  command: string | null,
  context: RepoContext,
): Promise<CheckState> {
  if (!command) return "skipped";
  logger.debug(`running ${label}: ${command}`);
  const [bin, ...args] = command.split(" ");
  const res = await run(bin, args, context.root);
  if (res.code !== 0) {
    logger.warn(`${label} reported issues (exit ${res.code}); left for review`);
    return "failed";
  }
  return "passed";
}

async function rollback(
  git: GitClient,
  branch: string,
  baseBranch: string | null,
): Promise<void> {
  try {
    // Discard staged + working-tree edits first (reset --hard), THEN switch
    // back to the base branch and delete the throwaway branch. Restoring from
    // the index would re-apply the very edits we are trying to discard.
    await git.discardAllChanges();
    if (baseBranch) {
      await git.checkout(baseBranch);
      await git.deleteBranch(branch);
    }
  } catch (err) {
    logger.warn(`rollback incomplete: ${(err as Error).message}`);
  }
}
