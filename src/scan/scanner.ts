import { statSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeAdapter } from "../claude/adapter";
import { SCAN_PER_FILE } from "../claude/promptBuild";
import type { Config } from "../config/schema";
import { logger } from "../logger";
import type { Candidate, RepoContext } from "../types";
import { chunkBySize } from "./chunk";

/** Approx. per-chunk budget of file-content characters (leaves headroom under
 *  the prompt total so boilerplate + rules fit). */
const CHUNK_BUDGET = 90_000;

/** Estimated prompt contribution of a file (bytes, capped at the per-file
 *  truncation used when building the digest). */
function fileSize(root: string, rel: string): number {
  try {
    return Math.min(statSync(join(root, rel)).size, SCAN_PER_FILE);
  } catch {
    return 0;
  }
}

/** Dedup key for a candidate. Each file lands in exactly one chunk, so this is
 *  mostly a safety net against a model echoing the same finding twice. */
function candidateKey(c: Candidate): string {
  return `${c.file}::${c.rule}::${c.reason}`;
}

/**
 * Run the scan step. Files are split into size-bounded chunks so a large repo
 * is fully covered across multiple model calls (bounded by max_scan_chunks),
 * rather than silently truncated to the first budget's worth of files.
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

  const chunks = chunkBySize(
    context.files,
    (f) => fileSize(context.root, f),
    CHUNK_BUDGET,
  );

  const cap = config.max_scan_chunks;
  const toScan = chunks.slice(0, cap);
  if (chunks.length > cap) {
    const droppedFiles = chunks
      .slice(cap)
      .reduce((n, c) => n + c.length, 0);
    logger.warn(
      `repo exceeds scan budget: scanning ${cap}/${chunks.length} chunks; ` +
        `${droppedFiles} files skipped (raise max_scan_chunks to cover more)`,
    );
  }

  logger.debug(
    `scanning ${context.files.length} files in ${toScan.length} chunk(s)`,
  );

  const seen = new Set<string>();
  const all: Candidate[] = [];
  for (const [i, files] of toScan.entries()) {
    logger.debug(`scan chunk ${i + 1}/${toScan.length} (${files.length} files)`);
    const candidates = await adapter.scanCandidates(context, config, files);
    for (const c of candidates) {
      const key = candidateKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(c);
    }
  }

  logger.debug(`model returned ${all.length} candidates`);
  return all;
}
