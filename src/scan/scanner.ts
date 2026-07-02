import type { ClaudeAdapter } from "../claude/adapter";
import type { Config } from "../config/schema";
import { logger } from "../logger";
import type { Candidate, RepoContext } from "../types";

/**
 * Run the scan step: hand repo context to the Claude adapter and return the
 * raw candidate list (unfiltered by safety limits — that is the planner's job).
 */
export async function scan(
  context: RepoContext,
  config: Config,
  adapter: ClaudeAdapter,
): Promise<Candidate[]> {
  if (context.files.length === 0) {
    logger.warn("no in-scope source files found; nothing to scan");
    return [];
  }
  logger.debug(`scanning ${context.files.length} files`);
  const candidates = await adapter.scanCandidates(context, config);
  logger.debug(`model returned ${candidates.length} candidates`);
  return candidates;
}
