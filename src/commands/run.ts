import { resolve } from "node:path";
import { apply } from "../apply/applier";
import { createAdapter } from "../claude/adapter";
import { loadConfig } from "../config/loader";
import { ShellGitClient } from "../git/client";
import { GhCliClient } from "../github/client";
import { logger } from "../logger";
import { planAll } from "../plan/planner";
import { buildPrBody } from "../pr/body";
import { preflight } from "../preflight";
import { inspectRepo } from "../repo/inspector";
import { scan } from "../scan/scanner";
import { applyLimitOverrides, applyRuleOverride } from "./shared";

export interface RunOptions {
  repo: string;
  dryRun: boolean;
  createPr: boolean;
  json: boolean;
  rules?: string;
  maxFiles?: number;
  maxChangedLines?: number;
  maxPrs?: number;
}

/** The full pipeline: scan -> plan -> apply -> (optional) PR. */
export async function runRun(opts: RunOptions): Promise<number> {
  const root = resolve(opts.repo);
  const git = new ShellGitClient(root);

  const pre = await preflight(git, {
    requireClean: true,
    requireClaude: true,
    cwd: root,
  });
  if (!pre.ok) {
    for (const p of pre.problems) logger.error(p);
    return 1;
  }
  const baseBranch = pre.currentBranch;

  const { config } = loadConfig(root);
  applyRuleOverride(config, opts.rules);
  applyLimitOverrides(config, opts);
  if (!config.enabled) {
    logger.warn("codebase-gardener is disabled in config (enabled: false)");
    return 0;
  }

  const adapter = await createAdapter(root);
  const context = await inspectRepo(root, git, config);

  const candidates = await scan(context, config, adapter);
  const plans = planAll(candidates, config);
  if (plans.length === 0) {
    logger.info("No safe maintenance changes to make.");
    return 0;
  }
  logger.info(
    `Planned ${plans.length} change set(s) (limit ${config.limits.max_prs_per_run}).`,
  );

  const dryEdits: Array<{ plan: unknown; edits: unknown }> = [];
  let exitCode = 0;

  for (const [i, changePlan] of plans.entries()) {
    logger.info(`\n[${i + 1}/${plans.length}] ${changePlan.title}`);
    for (const c of changePlan.candidates) {
      logger.info(`  - [${c.rule}] ${c.file}: ${c.reason}`);
    }

    // Each plan must branch from the base branch, not the previous plan's.
    if (!opts.dryRun && baseBranch) {
      await git.checkout(baseBranch);
    }

    const result = await apply(context, changePlan, config, git, adapter, {
      dryRun: opts.dryRun,
      baseBranch,
    });

    if (opts.dryRun) {
      logger.info("  [dry-run] proposed edits (not written):");
      for (const e of result.edits) logger.info(`    - ${e.file}: ${e.summary}`);
      dryEdits.push({ plan: changePlan, edits: result.edits });
      continue;
    }

    if (result.aborted) {
      logger.error(`  aborted by safety check: ${result.aborted}`);
      exitCode = 1;
      continue;
    }
    if (!result.committed) {
      logger.info("  Model produced no applicable edits; nothing committed.");
      continue;
    }
    logger.info(
      `  Committed ${result.edits.length} file(s) on ${result.branch}.`,
    );

    if (!opts.createPr) {
      logger.info("  PR not created (pass --create-pr).");
      continue;
    }
    const code = await openPullRequest(root, git, result.branch, changePlan, result, config);
    if (code !== 0) exitCode = code;
  }

  // Leave the caller back on the base branch for a tidy working state.
  if (!opts.dryRun && baseBranch) {
    await git.checkout(baseBranch);
  }

  if (opts.dryRun && opts.json) {
    logger.out(JSON.stringify({ plans: dryEdits }, null, 2));
  }
  return exitCode;
}

async function openPullRequest(
  root: string,
  git: ShellGitClient,
  branch: string,
  changePlan: import("../types").ChangePlan,
  result: import("../apply/applier").ApplyResult,
  config: import("../config/schema").Config,
): Promise<number> {
  const gh = new GhCliClient(root);
  if (!(await gh.isAvailable())) {
    logger.error("gh CLI not found; cannot create PR. Branch is committed locally.");
    return 1;
  }
  if (!(await gh.isAuthenticated())) {
    logger.error("gh is not authenticated; run `gh auth login`. Branch is committed locally.");
    return 1;
  }

  await git.push(branch);

  const body = buildPrBody(changePlan, result.edits, result.verification);
  const url = await gh.createPullRequest({
    title: changePlan.title,
    body,
    branch,
    draft: config.pr.draft,
    labels: config.pr.labels,
  });
  logger.info(`Opened PR: ${url}`);
  return 0;
}
