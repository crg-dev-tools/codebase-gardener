// Uses zod v4 so the schemas type-match the SDK's `zodOutputFormat` helper
// (which imports from `zod/v4`). Kept separate from the v3 config schema.
import * as z from "zod/v4";

const ruleId = z.enum([
  "lint_fix",
  "unused_import",
  "deprecated_api",
  "type_narrowing",
  "small_test_addition",
  "typo",
  "stale_docs",
]);

/** Structured-output schema for the scan step. Top level must be an object. */
export const scanResultSchema = z.object({
  candidates: z.array(
    z.object({
      rule: ruleId,
      file: z.string(),
      reason: z.string(),
      risk: z.enum(["low", "medium", "high"]),
      confidence: z.number(),
      expectedDiff: z.string(),
    }),
  ),
});

/** Structured-output schema for the plan/apply step. Edits are minimal
 *  exact-string replacements, not whole-file rewrites. */
export const editResultSchema = z.object({
  edits: z.array(
    z.object({
      file: z.string(),
      replacements: z.array(
        z.object({
          oldString: z.string(),
          newString: z.string(),
        }),
      ),
      summary: z.string(),
    }),
  ),
});
