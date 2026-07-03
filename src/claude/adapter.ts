import type { Config } from "../config/schema";
import { logger } from "../logger";
import type { Candidate, FileEdit, RepoContext } from "../types";
import { commandExists } from "../util/exec";
import { hasApiKey } from "./client";

/**
 * The Claude adapter. All model access goes through this interface so the rest
 * of the tool never depends on a specific backend or transport.
 */
export interface ClaudeAdapter {
  /** Scan the given subset of `files` for candidates. */
  scanCandidates(
    context: RepoContext,
    config: Config,
    files: string[],
  ): Promise<Candidate[]>;
  planEdits(context: RepoContext, candidates: Candidate[]): Promise<FileEdit[]>;
}

export type Backend = "cli" | "api";

/** True when the Claude Code CLI is available on PATH. */
export async function claudeCliAvailable(cwd: string): Promise<boolean> {
  return commandExists("claude", cwd);
}

/**
 * Pick a Claude backend. Preference order:
 *  1. explicit `GARDENER_BACKEND` env (`cli` | `api`)
 *  2. Claude Code CLI (reuses the existing claude.ai login — no API key)
 *  3. Anthropic HTTP API (requires ANTHROPIC_API_KEY)
 */
export async function createAdapter(cwd: string): Promise<ClaudeAdapter> {
  const forced = process.env.GARDENER_BACKEND as Backend | undefined;

  if (forced === "api") {
    logger.debug("backend: api (forced)");
    return new (await import("./apiAdapter")).AnthropicApiAdapter();
  }
  if (forced === "cli") {
    logger.debug("backend: cli (forced)");
    return new (await import("./cliAdapter")).ClaudeCliAdapter(cwd);
  }

  if (await claudeCliAvailable(cwd)) {
    logger.debug("backend: cli (Claude Code login)");
    return new (await import("./cliAdapter")).ClaudeCliAdapter(cwd);
  }
  if (hasApiKey()) {
    logger.debug("backend: api (ANTHROPIC_API_KEY)");
    return new (await import("./apiAdapter")).AnthropicApiAdapter();
  }

  throw new Error(
    "No Claude backend available. Install the Claude Code CLI and log in " +
      "(`claude` — reuses your claude.ai login), or set ANTHROPIC_API_KEY to " +
      "use the Anthropic API.",
  );
}

/** True when at least one Claude backend is usable. */
export async function anyBackendAvailable(cwd: string): Promise<boolean> {
  return (await claudeCliAvailable(cwd)) || hasApiKey();
}
