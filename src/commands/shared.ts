import type { Config } from "../config/schema";
import { ruleIdSchema } from "../config/schema";
import { logger } from "../logger";

/** Apply a comma-separated `--rules` override onto a loaded config, in place. */
export function applyRuleOverride(config: Config, rules?: string): void {
  if (!rules) return;
  const parsed: Config["rules"] = [];
  for (const raw of rules.split(",")) {
    const name = raw.trim();
    if (!name) continue;
    const result = ruleIdSchema.safeParse(name);
    if (result.success) {
      parsed.push(result.data);
    } else {
      logger.warn(`ignoring unknown rule '${name}'`);
    }
  }
  if (parsed.length > 0) config.rules = parsed;
}

/** Apply numeric limit overrides onto a loaded config, in place. */
export function applyLimitOverrides(
  config: Config,
  overrides: {
    maxFiles?: number;
    maxChangedLines?: number;
    maxPrs?: number;
  },
): void {
  if (overrides.maxFiles !== undefined)
    config.limits.max_files_per_pr = overrides.maxFiles;
  if (overrides.maxChangedLines !== undefined)
    config.limits.max_changed_lines_per_pr = overrides.maxChangedLines;
  if (overrides.maxPrs !== undefined)
    config.limits.max_prs_per_run = overrides.maxPrs;
}
