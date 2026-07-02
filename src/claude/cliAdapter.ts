import * as z from "zod/v4";
import type { Config } from "../config/schema";
import { logger } from "../logger";
import type { Candidate, FileEdit, RepoContext } from "../types";
import { runWithInput } from "../util/exec";
import type { ClaudeAdapter } from "./adapter";
import { APPLY_SYSTEM, SCAN_SYSTEM } from "./prompts";
import { buildApplyPrompt, buildScanPrompt } from "./promptBuild";
import { editResultSchema, scanResultSchema } from "./schemas";

/** Envelope shape returned by `claude -p --output-format json`. */
interface CliEnvelope {
  is_error?: boolean;
  result?: string;
}

/**
 * Extract the first top-level JSON object from a text blob, tolerating
 * surrounding prose or ```json fences. Returns null if none is found.
 */
function extractJsonObject(text: string): string | null {
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return stripped.slice(start, end + 1);
}

/**
 * Claude adapter that shells out to the Claude Code CLI (`claude`) in headless
 * print mode. It reuses the user's existing claude.ai login — no API key
 * needed. The schema is embedded in the prompt and the JSON is parsed back
 * out of the model's response (the CLI's own structured-output field is
 * unreliable for report-shaped prompts).
 */
export class ClaudeCliAdapter implements ClaudeAdapter {
  constructor(private readonly cwd: string) {}

  private async call<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<T | null> {
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
    const fullPrompt = `${systemPrompt}

Respond with ONLY a single JSON object that conforms EXACTLY to this JSON Schema — same field names, no extra fields, no prose, no markdown, no code fences:

${jsonSchema}

${userPrompt}`;

    const res = await runWithInput(
      "claude",
      ["-p", "--output-format", "json"],
      this.cwd,
      fullPrompt,
    );
    if (res.code !== 0) {
      throw new Error(
        `claude CLI failed (exit ${res.code}): ${res.stderr.trim() || res.stdout.trim()}`,
      );
    }

    let envelope: CliEnvelope;
    try {
      envelope = JSON.parse(res.stdout) as CliEnvelope;
    } catch {
      throw new Error(
        `could not parse claude CLI output as JSON: ${res.stdout.slice(0, 300)}`,
      );
    }
    if (envelope.is_error) {
      throw new Error(`claude CLI reported an error: ${envelope.result ?? ""}`);
    }

    const jsonText = extractJsonObject(envelope.result ?? "");
    if (!jsonText) {
      logger.warn("claude CLI response contained no JSON object");
      return null;
    }
    let data: unknown;
    try {
      data = JSON.parse(jsonText);
    } catch {
      logger.warn("claude CLI JSON could not be parsed");
      return null;
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      logger.warn("claude CLI JSON did not match the expected schema");
      return null;
    }
    return parsed.data;
  }

  async scanCandidates(
    context: RepoContext,
    config: Config,
  ): Promise<Candidate[]> {
    const result = await this.call(
      SCAN_SYSTEM,
      buildScanPrompt(context, config),
      scanResultSchema,
    );
    if (!result) return [];
    const inScope = new Set(context.files);
    return result.candidates.filter((c) => inScope.has(c.file)) as Candidate[];
  }

  async planEdits(
    context: RepoContext,
    candidates: Candidate[],
  ): Promise<FileEdit[]> {
    const { prompt, targetFiles } = buildApplyPrompt(context, candidates);
    const result = await this.call(APPLY_SYSTEM, prompt, editResultSchema);
    if (!result) return [];
    const inScope = new Set(targetFiles);
    return result.edits.filter((e) => inScope.has(e.file)) as FileEdit[];
  }
}
