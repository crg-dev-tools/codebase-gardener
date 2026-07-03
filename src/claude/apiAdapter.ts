import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Config } from "../config/schema";
import type { Candidate, FileEdit, RepoContext } from "../types";
import type { ClaudeAdapter } from "./adapter";
import { createClient, MAX_TOKENS, MODEL } from "./client";
import { APPLY_SYSTEM, SCAN_SYSTEM } from "./prompts";
import { buildApplyPrompt, buildScanPrompt } from "./promptBuild";
import { editResultSchema, scanResultSchema } from "./schemas";

/**
 * Claude adapter backed by the Anthropic HTTP API (`@anthropic-ai/sdk`).
 * Requires ANTHROPIC_API_KEY. Uses structured outputs via `messages.parse`.
 */
export class AnthropicApiAdapter implements ClaudeAdapter {
  async scanCandidates(
    context: RepoContext,
    config: Config,
    files: string[],
  ): Promise<Candidate[]> {
    const client = createClient();
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: {
        format: zodOutputFormat(scanResultSchema),
        effort: "high",
      },
      system: SCAN_SYSTEM,
      messages: [
        { role: "user", content: buildScanPrompt(context, config, files) },
      ],
    });
    const parsed = response.parsed_output;
    if (!parsed) return [];
    const inScope = new Set(files);
    return parsed.candidates.filter((c) => inScope.has(c.file)) as Candidate[];
  }

  async planEdits(
    context: RepoContext,
    candidates: Candidate[],
  ): Promise<FileEdit[]> {
    const client = createClient();
    const { prompt, targetFiles } = buildApplyPrompt(context, candidates);
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: {
        format: zodOutputFormat(editResultSchema),
        effort: "high",
      },
      system: APPLY_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = response.parsed_output;
    if (!parsed) return [];
    const inScope = new Set(targetFiles);
    return parsed.edits.filter((e) => inScope.has(e.file)) as FileEdit[];
  }
}
