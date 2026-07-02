import Anthropic from "@anthropic-ai/sdk";

/** Model + generation settings shared by every Claude call. */
export const MODEL = "claude-opus-4-8";
export const MAX_TOKENS = 16000;

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Export it before running `scan` or `run` " +
        "(the Claude-powered commands). `doctor`, `init` and `build` work without it.",
    );
    this.name = "MissingApiKeyError";
  }
}

/** True when a Claude API key is available in the environment. */
export function hasApiKey(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );
}

/** Construct an Anthropic client, or throw a clear error if no key is set. */
export function createClient(): Anthropic {
  if (!hasApiKey()) throw new MissingApiKeyError();
  return new Anthropic();
}
