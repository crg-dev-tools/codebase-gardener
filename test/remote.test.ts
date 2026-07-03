import { describe, expect, it } from "vitest";
import { parseOwnerRepo } from "../src/github/remote";

describe("parseOwnerRepo", () => {
  it("parses HTTPS URLs with .git", () => {
    expect(parseOwnerRepo("https://github.com/crg-dev-tools/codebase-gardener.git")).toEqual({
      owner: "crg-dev-tools",
      repo: "codebase-gardener",
    });
  });

  it("parses HTTPS URLs without .git and trailing slash", () => {
    expect(parseOwnerRepo("https://github.com/owner/repo/")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses SSH URLs", () => {
    expect(parseOwnerRepo("git@github.com:owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseOwnerRepo("https://gitlab.com/owner/repo.git")).toBeNull();
    expect(parseOwnerRepo("not a url")).toBeNull();
  });
});
