import { resolve } from "node:path";
import { createAdapter } from "../claude/adapter";
import { loadConfig } from "../config/loader";
import { ShellGitClient } from "../git/client";
import { logger } from "../logger";
import { candidatesJson, candidatesTable } from "../output/report";
import { preflight } from "../preflight";
import { inspectRepo } from "../repo/inspector";
import { scan } from "../scan/scanner";
import { applyRuleOverride } from "./shared";

export interface ScanOptions {
  repo: string;
  json: boolean;
  rules?: string;
}

/** List maintenance candidates without creating branches or PRs. */
export async function runScan(opts: ScanOptions): Promise<number> {
  const root = resolve(opts.repo);
  const git = new ShellGitClient(root);

  const pre = await preflight(git, {
    requireClean: false,
    requireClaude: true,
    cwd: root,
  });
  if (!pre.ok) {
    for (const p of pre.problems) logger.error(p);
    return 1;
  }

  const { config, sourcePath } = loadConfig(root);
  applyRuleOverride(config, opts.rules);
  if (!config.enabled) {
    logger.warn("codebase-gardener is disabled in config (enabled: false)");
    return 0;
  }
  logger.debug(`config: ${sourcePath ?? "defaults"}`);

  const context = await inspectRepo(root, git, config);
  const adapter = await createAdapter(root);
  const candidates = await scan(context, config, adapter);

  if (opts.json) {
    logger.out(candidatesJson(candidates));
  } else {
    logger.info(candidatesTable(candidates));
  }
  return 0;
}
