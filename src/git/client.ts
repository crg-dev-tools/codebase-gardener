import { run } from "../util/exec";

/**
 * Abstraction over git operations. The MVP shells out to the `git` binary;
 * a future implementation could talk to a library or a GitHub App token
 * without changing callers.
 */
export interface GitClient {
  isRepo(): Promise<boolean>;
  currentBranch(): Promise<string | null>;
  isClean(): Promise<boolean>;
  /** Repo-relative paths tracked or untracked (respecting .gitignore). */
  listFiles(): Promise<string[]>;
  createBranch(name: string): Promise<void>;
  checkout(name: string): Promise<void>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  push(branch: string): Promise<void>;
  /** Push a branch to an explicit (credentialed) URL, without touching the
   *  configured `origin`. Used by the GitHub App backend. */
  pushToUrl(branch: string, remoteUrl: string): Promise<void>;
  /** Number of changed lines (added + deleted) relative to HEAD, counting
   *  both staged and unstaged changes. */
  changedLineCount(): Promise<number>;
  /** Discard ALL staged and working-tree changes, resetting to HEAD. */
  discardAllChanges(): Promise<void>;
  /** Delete a local branch (force). */
  deleteBranch(name: string): Promise<void>;
  /** True if a branch with this name exists locally or on `origin`. */
  branchExists(name: string): Promise<boolean>;
  /** The `origin` remote URL, or null if there is none. */
  remoteUrl(): Promise<string | null>;
}

export class ShellGitClient implements GitClient {
  constructor(private readonly cwd: string) {}

  private async git(args: string[]) {
    return run("git", args, this.cwd);
  }

  async isRepo(): Promise<boolean> {
    const res = await this.git(["rev-parse", "--is-inside-work-tree"]);
    return res.code === 0 && res.stdout.trim() === "true";
  }

  async currentBranch(): Promise<string | null> {
    const res = await this.git(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (res.code !== 0) return null;
    const branch = res.stdout.trim();
    return branch === "HEAD" ? null : branch;
  }

  async isClean(): Promise<boolean> {
    const res = await this.git(["status", "--porcelain"]);
    return res.code === 0 && res.stdout.trim() === "";
  }

  async listFiles(): Promise<string[]> {
    // Tracked + untracked, excluding gitignored files.
    const res = await this.git([
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
    ]);
    if (res.code !== 0) return [];
    return res.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  async createBranch(name: string): Promise<void> {
    const res = await this.git(["checkout", "-b", name]);
    if (res.code !== 0) {
      throw new Error(`git checkout -b ${name} failed: ${res.stderr.trim()}`);
    }
  }

  async checkout(name: string): Promise<void> {
    const res = await this.git(["checkout", name]);
    if (res.code !== 0) {
      throw new Error(`git checkout ${name} failed: ${res.stderr.trim()}`);
    }
  }

  async add(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const res = await this.git(["add", "--", ...paths]);
    if (res.code !== 0) {
      throw new Error(`git add failed: ${res.stderr.trim()}`);
    }
  }

  async commit(message: string): Promise<void> {
    const res = await this.git(["commit", "-m", message]);
    if (res.code !== 0) {
      throw new Error(`git commit failed: ${res.stderr.trim()}`);
    }
  }

  async push(branch: string): Promise<void> {
    const res = await this.git(["push", "--set-upstream", "origin", branch]);
    if (res.code !== 0) {
      throw new Error(`git push failed: ${res.stderr.trim()}`);
    }
  }

  async pushToUrl(branch: string, remoteUrl: string): Promise<void> {
    const res = await this.git(["push", remoteUrl, `${branch}:${branch}`]);
    if (res.code !== 0) {
      // Never surface an embedded token in error output.
      const scrubbed = res.stderr.replace(
        /x-access-token:[^@]+@/g,
        "x-access-token:***@",
      );
      throw new Error(`git push failed: ${scrubbed.trim()}`);
    }
  }

  async changedLineCount(): Promise<number> {
    // Diff against HEAD so the count includes staged changes (after `git add`,
    // a plain `git diff` shows nothing). Covers both staged and unstaged.
    const res = await this.git(["diff", "HEAD", "--numstat"]);
    if (res.code !== 0) return 0;
    let total = 0;
    for (const line of res.stdout.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const added = Number.parseInt(parts[0], 10);
      const deleted = Number.parseInt(parts[1], 10);
      if (!Number.isNaN(added)) total += added;
      if (!Number.isNaN(deleted)) total += deleted;
    }
    return total;
  }

  async discardAllChanges(): Promise<void> {
    // `reset --hard` clears both the index and the working tree back to HEAD,
    // so already-`git add`-ed edits are discarded too. `run` requires a clean
    // tree up front, so this only ever throws away edits this tool just made.
    await this.git(["reset", "--hard", "HEAD"]);
  }

  async deleteBranch(name: string): Promise<void> {
    await this.git(["branch", "-D", name]);
  }

  async branchExists(name: string): Promise<boolean> {
    const local = await this.git(["rev-parse", "--verify", "--quiet", name]);
    if (local.code === 0) return true;
    const remote = await this.git(["ls-remote", "--heads", "origin", name]);
    return remote.code === 0 && remote.stdout.trim() !== "";
  }

  async remoteUrl(): Promise<string | null> {
    const res = await this.git(["remote", "get-url", "origin"]);
    if (res.code !== 0) return null;
    const url = res.stdout.trim();
    return url === "" ? null : url;
  }
}
