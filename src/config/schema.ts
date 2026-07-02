import { z } from "zod";

/** Zod schema for `.github/codebase-gardener.yml`. Every field is optional;
 *  defaults are applied so that a repo with no config still works safely. */
export const ruleIdSchema = z.enum([
  "lint_fix",
  "unused_import",
  "deprecated_api",
  "type_narrowing",
  "small_test_addition",
  "typo",
  "stale_docs",
]);

export const configSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(["safe"]).default("safe"),
  limits: z
    .object({
      max_files_per_pr: z.number().int().positive().default(5),
      max_changed_lines_per_pr: z.number().int().positive().default(200),
      max_prs_per_run: z.number().int().positive().default(1),
    })
    .default({}),
  rules: z
    .array(ruleIdSchema)
    .default([
      "lint_fix",
      "unused_import",
      "deprecated_api",
      "type_narrowing",
      "small_test_addition",
      "typo",
      "stale_docs",
    ]),
  exclude: z
    .array(z.string())
    .default([
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "vendor/**",
      "migrations/**",
      "**/*.min.js",
    ]),
  pr: z
    .object({
      draft: z.boolean().default(true),
      branch_prefix: z.string().default("gardener/"),
      labels: z.array(z.string()).default(["maintenance", "ai-generated"]),
    })
    .default({}),
});

export type Config = z.infer<typeof configSchema>;

/** The fully-defaulted config used when no file is present. */
export function defaultConfig(): Config {
  return configSchema.parse({});
}
