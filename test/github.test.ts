import { describe, expect, it } from "vitest";
import { buildPrCreateArgs } from "../src/github/client";

describe("buildPrCreateArgs", () => {
  const base = {
    title: "chore: tidy",
    body: "body text",
    branch: "gardener/tidy-20260101",
    labels: ["maintenance", "ai-generated"],
  };

  it("builds title/body/head args and omits labels", () => {
    const args = buildPrCreateArgs({ ...base, draft: false });
    expect(args.slice(0, 2)).toEqual(["pr", "create"]);
    expect(args).toEqual([
      "pr",
      "create",
      "--title",
      "chore: tidy",
      "--body",
      "body text",
      "--head",
      "gardener/tidy-20260101",
    ]);
    // labels are applied separately, never on `pr create`
    expect(args).not.toContain("--label");
    expect(args).not.toContain("maintenance");
  });

  it("adds --draft when requested", () => {
    const args = buildPrCreateArgs({ ...base, draft: true });
    expect(args).toContain("--draft");
  });
});
