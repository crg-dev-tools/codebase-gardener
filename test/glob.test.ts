import { describe, expect, it } from "vitest";
import { matchesAny, normalizePath } from "../src/util/glob";

describe("glob matcher", () => {
  it("matches ** across path segments", () => {
    expect(matchesAny("node_modules/foo/bar.js", ["node_modules/**"])).toBe(true);
    expect(matchesAny("src/node_modules/x.ts", ["**/node_modules/**"])).toBe(true);
  });

  it("matches * within a single segment only", () => {
    expect(matchesAny("a.min.js", ["*.min.js"])).toBe(true);
    expect(matchesAny("dir/a.min.js", ["*.min.js"])).toBe(false);
    expect(matchesAny("dir/a.min.js", ["**/*.min.js"])).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(matchesAny("src/index.ts", ["dist/**", "build/**"])).toBe(false);
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(normalizePath("src\\a\\b.ts")).toBe("src/a/b.ts");
    expect(matchesAny("dist\\bundle.js", ["dist/**"])).toBe(true);
  });

  it("escapes regex metacharacters in literal patterns", () => {
    expect(matchesAny("a+b.ts", ["a+b.ts"])).toBe(true);
    expect(matchesAny("axb.ts", ["a+b.ts"])).toBe(false);
  });
});
