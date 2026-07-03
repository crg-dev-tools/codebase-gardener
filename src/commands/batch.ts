import { loadRegistry, resolveRepoPath, type RepoEntry } from "../config/registry";
import { logger } from "../logger";
import { runRun } from "./run";

export interface BatchOptions {
  registry: string;
  /** Defaults applied to every repo unless the entry overrides them. */
  dryRun: boolean;
  createPr: boolean;
  rules?: string;
  maxPrs?: number;
  maxFiles?: number;
  maxChangedLines?: number;
}

/** Merge batch defaults with a per-repo entry into RunOptions. */
function optionsFor(
  entry: RepoEntry,
  baseDir: string,
  opts: BatchOptions,
): Parameters<typeof runRun>[0] {
  return {
    repo: resolveRepoPath(baseDir, entry.path),
    dryRun: entry.dry_run ?? opts.dryRun,
    createPr: entry.create_pr ?? opts.createPr,
    json: false,
    rules: entry.rules ? entry.rules.join(",") : opts.rules,
    maxPrs: entry.max_prs ?? opts.maxPrs,
    maxFiles: entry.max_files ?? opts.maxFiles,
    maxChangedLines: entry.max_changed_lines ?? opts.maxChangedLines,
  };
}

/** Run the maintenance pipeline across every repo in the registry. */
export async function runBatch(opts: BatchOptions): Promise<number> {
  let registry;
  try {
    registry = loadRegistry(opts.registry);
  } catch (err) {
    logger.error((err as Error).message);
    return 1;
  }

  if (registry.repos.length === 0) {
    logger.warn(`no repos listed in ${registry.path}`);
    return 0;
  }

  logger.info(`Batch over ${registry.repos.length} repo(s) from ${registry.path}`);

  let failures = 0;
  for (const [i, entry] of registry.repos.entries()) {
    const runOptions = optionsFor(entry, registry.baseDir, opts);
    logger.info(
      `\n========== [${i + 1}/${registry.repos.length}] ${runOptions.repo} ==========`,
    );
    try {
      const code = await runRun(runOptions);
      if (code !== 0) failures++;
    } catch (err) {
      logger.error(`repo failed: ${(err as Error).message}`);
      failures++;
    }
  }

  logger.info(
    `\nBatch complete: ${registry.repos.length - failures}/${registry.repos.length} repo(s) OK.`,
  );
  return failures === 0 ? 0 : 1;
}
