import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { ruleIdSchema } from "./schema";

/** One repo entry in the batch registry. `path` is resolved relative to the
 *  registry file. All other fields override the batch command's defaults. */
export const repoEntrySchema = z.object({
  path: z.string(),
  rules: z.array(ruleIdSchema).optional(),
  create_pr: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  max_prs: z.number().int().positive().optional(),
  max_files: z.number().int().positive().optional(),
  max_changed_lines: z.number().int().positive().optional(),
});

export const registrySchema = z.object({
  repos: z.array(repoEntrySchema).default([]),
});

export type RepoEntry = z.infer<typeof repoEntrySchema>;

export interface LoadedRegistry {
  repos: RepoEntry[];
  /** Directory the registry file lives in (base for relative repo paths). */
  baseDir: string;
  path: string;
}

/** Load and validate a batch registry file. Throws with a clear message on
 *  a missing file or invalid contents. */
export function loadRegistry(registryPath: string): LoadedRegistry {
  const path = resolve(registryPath);
  if (!existsSync(path)) {
    throw new Error(`registry file not found: ${path}`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, "utf8")) ?? {};
  } catch (err) {
    throw new Error(`failed to parse ${registryPath}: ${(err as Error).message}`);
  }
  const result = registrySchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`invalid registry ${registryPath}:\n${issues}`);
  }
  return { repos: result.data.repos, baseDir: dirname(path), path };
}

/** Resolve a registry entry's repo path against the registry directory. */
export function resolveRepoPath(baseDir: string, entryPath: string): string {
  return resolve(baseDir, entryPath);
}
