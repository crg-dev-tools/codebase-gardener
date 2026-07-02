import { resolve } from "node:path";
import { apply } from "../apply/applier";
import { createAdapter } from "../claude/adapter";
import { loadConfig } from "../config/loader";
import { ShellGitClient } from "../git/client";
import { GhCliClient } from "../github/client";
import { logger } from "../logger";
import { plan as buildPlan } from "../plan/planner";
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
  const changePlan = buildPlan(candidates, config);
  if (!changePlan) {
    logger.info("No safe maintenance changes to make.");
    return 0;
  }

  logger.info(`Plan: ${changePlan.title}`);
  logger.info(`Branch: ${changePlan.branch}`);
  for (const c of changePlan.candidates) {
    logger.info(`  - [${c.rule}] ${c.file}: ${c.reason}`);
  }

  const result = await apply(context, changePlan, config, git, adapter, {
    dryRun: opts.dryRun,
    baseBranch,
  });

  if (opts.dryRun) {
    logger.info("\n[dry-run] proposed edits (not written):");
    for (const e of result.edits) {
      logger.info(`  - ${e.file}: ${e.summary}`);
    }
    if (opts.json) {
      logger.out(JSON.stringify({ plan: changePlan, edits: result.edits }, null, 2));
    }
    return 0;
  }

  if (result.aborted) {
    logger.error(`aborted by safety check: ${result.aborted}`);
    return 1;
  }
  if (!result.committed) {
    logger.info("Model produced no applicable edits; nothing committed.");
    return 0;
  }

  logger.info(`Committed ${result.edits.length} file(s) on ${result.branch}.`);

  if (!opts.createPr) {
    logger.info(
      "PR not created (pass --create-pr to push and open a pull request).",
    );
    return 0;
  }

  return openPullRequest(root, git, changePlan, result.edits, config);
}

async function openPullRequest(
  root: string,
  git: ShellGitClient,
  changePlan: import("../types").ChangePlan,
  edits: import("../types").FileEdit[],
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

  await git.push(changePlan.branch);

  const body = buildPrBody(changePlan, edits, {
    build: false,
    test: false,
    lint: false,
  });
  const url = await gh.createPullRequest({
    title: changePlan.title,
    body,
    branch: changePlan.branch,
    draft: config.pr.draft,
    labels: config.pr.labels,
  });
  logger.info(`Opened PR: ${url}`);
  return 0;
}
