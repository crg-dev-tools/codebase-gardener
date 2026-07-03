import { describe, expect, it } from "vitest";
import { RULE_DESCRIPTIONS } from "../src/claude/prompts";
import { defaultConfig } from "../src/config/schema";

describe("rule glossary", () => {
  it("has a description for every default rule", () => {
    for (const rule of defaultConfig().rules) {
      expect(RULE_DESCRIPTIONS[rule], `missing description for ${rule}`).toBeTruthy();
    }
  });

  it("includes the newly added rules", () => {
    expect(RULE_DESCRIPTIONS.unused_variable).toMatch(/unused/i);
    expect(RULE_DESCRIPTIONS.remove_debugger).toMatch(/debugger/i);
    // default rule set includes them
    expect(defaultConfig().rules).toContain("unused_variable");
    expect(defaultConfig().rules).toContain("remove_debugger");
  });
});
