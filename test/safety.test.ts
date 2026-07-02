import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/schema";
import {
  checkContentIntegrity,
  checkEditLimits,
  countCodeFences,
  filterSafeCandidates,
  selectWithinFileBudget,
} from "../src/safety/guard";
import type { Candidate, FileEdit } from "../src/types";

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

describe("safety guard", () => {
  it("drops non-low risk, low-confidence, excluded, and disallowed candidates", () => {
    const config = defaultConfig();
    const input: Candidate[] = [
      candidate({}), // keep
      candidate({ file: "src/b.ts", risk: "medium" }), // drop: risk
      candidate({ file: "src/c.ts", confidence: 0.3 }), // drop: confidence
      candidate({ file: "node_modules/x.ts" }), // drop: excluded
      candidate({ file: "src/d.ts", rule: "deprecated_api" }), // keep (allowed)
    ];
    const kept = filterSafeCandidates(input, config);
    const files = kept.map((c) => c.file).sort();
    expect(files).toEqual(["src/a.ts", "src/d.ts"]);
  });

  it("respects the rule allow-list override", () => {
    const config = defaultConfig();
    config.rules = ["typo"];
    const kept = filterSafeCandidates([candidate({})], config);
    expect(kept).toHaveLength(0);
  });

  it("selects within the file budget, keeping whole files", () => {
    const config = defaultConfig();
    config.limits.max_files_per_pr = 2;
    const input: Candidate[] = [
      candidate({ file: "a.ts" }),
      candidate({ file: "a.ts", reason: "second on same file" }),
      candidate({ file: "b.ts" }),
      candidate({ file: "c.ts" }),
    ];
    const selected = selectWithinFileBudget(input, config);
    const files = new Set(selected.map((c) => c.file));
    expect(files.size).toBe(2);
    expect(files.has("a.ts")).toBe(true);
    expect(files.has("b.ts")).toBe(true);
    expect(files.has("c.ts")).toBe(false);
    // both candidates for a.ts survive
    expect(selected.filter((c) => c.file === "a.ts")).toHaveLength(2);
  });

  it("flags edits that exceed limits", () => {
    const config = defaultConfig();
    config.limits.max_files_per_pr = 1;
    config.limits.max_changed_lines_per_pr = 10;
    const edits: FileEdit[] = [
      { file: "a.ts", newContent: "", summary: "x" },
      { file: "b.ts", newContent: "", summary: "y" },
    ];
    const violations = checkEditLimits(edits, 50, config);
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(violations.some((v) => /files/.test(v.message))).toBe(true);
    expect(violations.some((v) => /lines/.test(v.message))).toBe(true);
  });

  it("passes clean edits within limits", () => {
    const config = defaultConfig();
    const edits: FileEdit[] = [{ file: "a.ts", newContent: "", summary: "x" }];
    expect(checkEditLimits(edits, 5, config)).toEqual([]);
  });
});

describe("content integrity", () => {
  it("counts code fences", () => {
    expect(countCodeFences("no fences")).toBe(0);
    expect(countCodeFences("```bash\nx\n```\n```\ny\n```")).toBe(4);
  });

  it("flags a markdown edit that strips code fences", () => {
    const original = "# Doc\n\n```bash\nnpm install\n```\n";
    const newContent = "# Doc\n\nbash\nnpm install\n\n"; // fences removed
    const v = checkContentIntegrity([
      { file: "README.md", original, newContent },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/fence count changed/);
  });

  it("allows a markdown edit that preserves fences", () => {
    const original = "# Doc\n\n```bash\nnpm install\n```\n";
    const newContent = "# Docs\n\n```bash\nnpm ci\n```\n"; // fences intact
    expect(
      checkContentIntegrity([
        { file: "README.md", original, newContent },
      ]),
    ).toEqual([]);
  });

  it("ignores non-markdown files", () => {
    const v = checkContentIntegrity([
      { file: "src/a.ts", original: "```", newContent: "no fence" },
    ]);
    expect(v).toEqual([]);
  });
});
