import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apply } from "../src/apply/applier";
import type { ClaudeAdapter } from "../src/claude/adapter";
import { defaultConfig } from "../src/config/schema";
import { ShellGitClient } from "../src/git/client";
import type { Candidate, ChangePlan, FileEdit, RepoContext } from "../src/types";

/** Adapter stub that returns a fixed set of edits. */
class StubAdapter implements ClaudeAdapter {
  constructor(private readonly edits: FileEdit[]) {}
  async scanCandidates(): Promise<Candidate[]> {
    return [];
  }
  async planEdits(): Promise<FileEdit[]> {
    return this.edits;
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const README = "# Doc\n\n```bash\nnpm install\n```\n\nSome text.\n";

describe("applier rollback (integration)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gardener-apply-"));
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "t@t.co"]);
    git(dir, ["config", "user.name", "t"]);
    writeFileSync(join(dir, "README.md"), README, "utf8");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "init"]);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function context(): RepoContext {
    return {
      root: dir,
      isGitRepo: true,
      defaultBranch: "main",
      packageManager: null,
      languages: [],
      lintCommand: null,
      testCommand: null,
      formatCommand: null,
      files: ["README.md"],
      projectRules: "",
    };
  }

  const candidate: Candidate = {
    rule: "stale_docs",
    file: "README.md",
    reason: "update docs",
    risk: "low",
    confidence: 0.9,
    expectedDiff: "docs",
  };

  const plan: ChangePlan = {
    candidates: [candidate],
    branch: "gardener/test-branch",
    commitMessage: "docs: update",
    title: "docs: update",
  };

  it("rolls back cleanly when an edit strips markdown code fences", async () => {
    const baseBranch = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    const gitClient = new ShellGitClient(dir);

    // A damaging edit: keeps the doc text but removes the ``` fences.
    const damaged: FileEdit = {
      file: "README.md",
      newContent: "# Doc\n\nbash\nnpm install\n\nSome text.\n",
      summary: "update",
    };
    const adapter = new StubAdapter([damaged]);

    const result = await apply(
      context(),
      plan,
      defaultConfig(),
      gitClient,
      adapter,
      { dryRun: false, baseBranch },
    );

    expect(result.committed).toBe(false);
    expect(result.aborted).toMatch(/fence count changed/);

    // The working tree must be fully restored: README intact, tree clean,
    // on the base branch, throwaway branch gone.
    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe(README);
    expect(git(dir, ["status", "--porcelain"]).trim()).toBe("");
    expect(git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe(
      baseBranch,
    );
    const branches = git(dir, ["branch"]);
    expect(branches).not.toContain("gardener/test-branch");
  });

  it("commits a clean edit that preserves fences", async () => {
    const baseBranch = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    const gitClient = new ShellGitClient(dir);

    const clean: FileEdit = {
      file: "README.md",
      newContent: "# Docs\n\n```bash\nnpm ci\n```\n\nSome text.\n",
      summary: "tidy docs",
    };
    const adapter = new StubAdapter([clean]);

    const result = await apply(
      context(),
      plan,
      defaultConfig(),
      gitClient,
      adapter,
      { dryRun: false, baseBranch },
    );

    expect(result.committed).toBe(true);
    expect(result.aborted).toBeUndefined();
    // committed on the gardener branch
    expect(git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe(
      "gardener/test-branch",
    );
    expect(git(dir, ["log", "--oneline", "-1"])).toContain("docs: update");
  });
});
