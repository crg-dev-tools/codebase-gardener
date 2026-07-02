import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { logger } from "../logger";
import { type Config, configSchema, defaultConfig } from "./schema";

/** Standard config path, relative to the repo root. */
export const CONFIG_REL_PATH = ".github/codebase-gardener.yml";

export interface LoadedConfig {
  config: Config;
  /** Absolute path the config was read from, or null if defaults were used. */
  sourcePath: string | null;
}

/**
 * Load configuration from `<repoRoot>/.github/codebase-gardener.yml`.
 * Missing file -> safe defaults. Invalid file -> throws with a clear message.
 */
export function loadConfig(repoRoot: string): LoadedConfig {
  const path = join(repoRoot, CONFIG_REL_PATH);
  if (!existsSync(path)) {
    logger.debug(`no config at ${path}; using safe defaults`);
    return { config: defaultConfig(), sourcePath: null };
  }

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, "utf8")) ?? {};
  } catch (err) {
    throw new Error(
      `failed to parse ${CONFIG_REL_PATH}: ${(err as Error).message}`,
    );
  }

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`invalid ${CONFIG_REL_PATH}:\n${issues}`);
  }

  return { config: result.data, sourcePath: path };
}
