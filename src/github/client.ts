import { run } from "../util/exec";

export interface CreatePrOptions {
  title: string;
  body: string;
  branch: string;
  draft: boolean;
  labels: string[];
}

/**
 * Abstraction over GitHub operations. The MVP shells out to the `gh` CLI and
 * relies on the user's existing `gh` auth. A future implementation could use a
 * GitHub App installation token without changing callers.
 */
export interface GithubClient {
  isAvailable(): Promise<boolean>;
  isAuthenticated(): Promise<boolean>;
  createPullRequest(opts: CreatePrOptions): Promise<string>;
}

export class GhCliClient implements GithubClient {
  constructor(private readonly cwd: string) {}

  async isAvailable(): Promise<boolean> {
    const res = await run("gh", ["--version"], this.cwd);
    return res.code === 0;
  }

  async isAuthenticated(): Promise<boolean> {
    const res = await run("gh", ["auth", "status"], this.cwd);
    return res.code === 0;
  }

  /** Create a PR and return its URL. Assumes the branch is already pushed. */
  async createPullRequest(opts: CreatePrOptions): Promise<string> {
    const args = [
      "pr",
      "create",
      "--title",
      opts.title,
      "--body",
      opts.body,
      "--head",
      opts.branch,
    ];
    if (opts.draft) args.push("--draft");
    for (const label of opts.labels) args.push("--label", label);

    const res = await run("gh", args, this.cwd);
    if (res.code !== 0) {
      throw new Error(`gh pr create failed: ${res.stderr.trim()}`);
    }
    return res.stdout.trim();
  }
}
