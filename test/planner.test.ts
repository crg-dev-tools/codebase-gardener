import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/schema";
import { plan } from "../src/plan/planner";
import type { Candidate } from "../src/types";

function candidate(over: Partial<Candidate>): Candidate {
  return {
    rule: "unused_import",
    file: "src/a.ts",
    reason: "unused import",
    risk: "low",
    confidence: 0.9,
    expectedDiff: "remove import",
    ...over,
  };
}

const FIXED = new Date(2026, 6, 2); // 2026-07-02 (month is 0-based)

describe("planner", () => {
  it("returns null when nothing safe remains", () => {
    const config = defaultConfig();
    const result = plan([candidate({ risk: "high" })], config, FIXED);
    expect(result).toBeNull();
  });

  it("builds a conventional-commit plan with a dated branch", () => {
    const config = defaultConfig();
    const result = plan([candidate({})], config, FIXED);
    expect(result).not.toBeNull();
    expect(result!.commitMessage).toBe("chore: remove unused imports");
    expect(result!.branch).toBe("gardener/remove-unused-imports-20260702");
    expect(result!.candidates).toHaveLength(1);
  });

  it("uses the branch prefix from config", () => {
    const config = defaultConfig();
    config.pr.branch_prefix = "bot/";
    const result = plan([candidate({ rule: "typo" })], config, FIXED);
    expect(result!.branch.startsWith("bot/")).toBe(true);
    expect(result!.commitMessage).toBe("docs: fix typos");
  });

  it("respects the per-PR file budget", () => {
    const config = defaultConfig();
    config.limits.max_files_per_pr = 1;
    const result = plan(
      [candidate({ file: "a.ts" }), candidate({ file: "b.ts" })],
      config,
      FIXED,
    );
    const files = new Set(result!.candidates.map((c) => c.file));
    expect(files.size).toBe(1);
  });
});
