import { describe, expect, it } from "vitest";
import { applyReplacements } from "../src/apply/patch";

describe("applyReplacements", () => {
  const src = 'import { a, b } from "x";\nconst y = a + 1;\n';

  it("applies a single unique replacement", () => {
    const r = applyReplacements(src, [
      { oldString: 'import { a, b } from "x";', newString: 'import { a } from "x";' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBe('import { a } from "x";\nconst y = a + 1;\n');
  });

  it("applies multiple replacements in order", () => {
    const r = applyReplacements(src, [
      { oldString: "const y", newString: "const z" },
      { oldString: "z = a + 1", newString: "z = a + 2" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("const z = a + 2;");
  });

  it("fails when oldString is not found", () => {
    const r = applyReplacements(src, [
      { oldString: "not present", newString: "x" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/);
  });

  it("fails when oldString is not unique", () => {
    const r = applyReplacements("a a a", [{ oldString: "a", newString: "b" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not unique/);
  });

  it("rejects an empty oldString", () => {
    const r = applyReplacements(src, [{ oldString: "", newString: "x" }]);
    expect(r.ok).toBe(false);
  });

  it("treats $-sequences in newString literally", () => {
    const r = applyReplacements("value = OLD;", [
      { oldString: "OLD", newString: "$& $1 $100" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toBe("value = $& $1 $100;");
  });

  it("fails on an empty replacement list", () => {
    expect(applyReplacements(src, []).ok).toBe(false);
  });
});
