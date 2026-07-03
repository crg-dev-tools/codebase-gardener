import { logger } from "../logger";
import { run } from "../util/exec";

export interface CreatePrOptions {
  title: string;
  body: string;
  branch: string;
  draft: boolean;
  labels: string[];
  /** Base branch for the PR. Omit to let the backend use the repo default. */
  base?: string;
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
  /** A push URL with embedded credentials, or null to use ambient git auth
   *  (i.e. `git push origin`). The App backend returns a token-injected URL. */
  authenticatedRemoteUrl(): Promise<string | null>;
}

/** Build the `gh pr create` argv (without labels — labels are applied
 *  separately so a missing label never blocks PR creation). Pure/testable. */
export function buildPrCreateArgs(opts: CreatePrOptions): string[] {
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
  if (opts.base) args.push("--base", opts.base);
  if (opts.draft) args.push("--draft");
  return args;
}

export class GhCliClient implements GithubClient {
  constructor(private readonly cwd: string) {}

  /** The CLI backend pushes with the user's ambient git auth. */
  async authenticatedRemoteUrl(): Promise<string | null> {
    return null;
  }

  async isAvailable(): Promise<boolean> {
    const res = await run("gh", ["--version"], this.cwd);
    return res.code === 0;
  }

  async isAuthenticated(): Promise<boolean> {
    const res = await run("gh", ["auth", "status"], this.cwd);
    return res.code === 0;
  }

  /** Create a PR and return its URL. Assumes the branch is already pushed.
   *  Labels are applied best-effort AFTER creation so a missing/undeletable
   *  label cannot block the PR itself. */
  async createPullRequest(opts: CreatePrOptions): Promise<string> {
    const res = await run("gh", buildPrCreateArgs(opts), this.cwd);
    if (res.code !== 0) {
      throw new Error(`gh pr create failed: ${res.stderr.trim()}`);
    }
    const url = res.stdout.trim();

    if (opts.labels.length > 0) {
      await this.applyLabels(url, opts.labels);
    }
    return url;
  }

  /** Ensure labels exist (create if missing) and add them to the PR. All
   *  steps are best-effort: a failure is warned about, not thrown. */
  private async applyLabels(prUrl: string, labels: string[]): Promise<void> {
    for (const label of labels) {
      // `--force` creates the label or leaves an existing one intact.
      await run(
        "gh",
        ["label", "create", label, "--color", "ededed", "--force"],
        this.cwd,
      );
    }
    const res = await run(
      "gh",
      ["pr", "edit", prUrl, "--add-label", labels.join(",")],
      this.cwd,
    );
    if (res.code !== 0) {
      logger.warn(
        `PR created, but labels could not be applied: ${res.stderr.trim()}`,
      );
    }
  }
}
