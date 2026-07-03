import { describe, expect, it } from "vitest";
import { AppGithubClient } from "../src/github/appClient";
import { buildPrCreateArgs, GhCliClient } from "../src/github/client";

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

  it("adds --base when a base branch is given", () => {
    const args = buildPrCreateArgs({ ...base, draft: false, base: "main" });
    expect(args).toContain("--base");
    expect(args[args.indexOf("--base") + 1]).toBe("main");
  });
});

describe("authenticatedRemoteUrl", () => {
  it("is null for the gh CLI backend (ambient auth)", async () => {
    const gh = new GhCliClient(".");
    expect(await gh.authenticatedRemoteUrl()).toBeNull();
  });

  it("embeds the installation token for the App backend", async () => {
    const app = new AppGithubClient("tok_123", {
      owner: "acme",
      repo: "widget",
    });
    expect(await app.authenticatedRemoteUrl()).toBe(
      "https://x-access-token:tok_123@github.com/acme/widget.git",
    );
  });
});
