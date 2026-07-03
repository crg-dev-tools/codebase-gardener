import { logger } from "../logger";
import type { CreatePrOptions, GithubClient } from "./client";
import type { OwnerRepo } from "./remote";

const API = "https://api.github.com";

/**
 * GitHub client backed by a GitHub App installation access token, talking to
 * the REST API directly (no `gh` CLI). This is the Phase 3 path: a worker
 * mints an installation token (see appAuth.ts) and drives PR creation with it.
 *
 * The token is scoped to one installation/repo; `ownerRepo` targets the repo.
 */
export class AppGithubClient implements GithubClient {
  constructor(
    private readonly token: string,
    private readonly ownerRepo: OwnerRepo,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  private repoPath(): string {
    return `${this.ownerRepo.owner}/${this.ownerRepo.repo}`;
  }

  /** A token-injected HTTPS URL so `git push` authenticates as the App. */
  async authenticatedRemoteUrl(): Promise<string | null> {
    return `https://x-access-token:${this.token}@github.com/${this.repoPath()}.git`;
  }

  async isAvailable(): Promise<boolean> {
    return this.token.length > 0;
  }

  async isAuthenticated(): Promise<boolean> {
    const res = await this.fetchImpl(`${API}/repos/${this.repoPath()}`, {
      headers: this.headers(),
    });
    return res.ok;
  }

  async createPullRequest(opts: CreatePrOptions): Promise<string> {
    const base = opts.base ?? (await this.defaultBranch());
    const res = await this.fetchImpl(`${API}/repos/${this.repoPath()}/pulls`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        title: opts.title,
        head: opts.branch,
        base,
        body: opts.body,
        draft: opts.draft,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `GitHub PR creation failed (HTTP ${res.status}): ${await res.text()}`,
      );
    }
    const pr = (await res.json()) as { html_url: string; number: number };
    if (opts.labels.length > 0) {
      await this.applyLabels(pr.number, opts.labels);
    }
    return pr.html_url;
  }

  private async defaultBranch(): Promise<string> {
    const res = await this.fetchImpl(`${API}/repos/${this.repoPath()}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`could not read repo default branch (HTTP ${res.status})`);
    }
    const repo = (await res.json()) as { default_branch: string };
    return repo.default_branch;
  }

  /** Add labels to the PR (labels are issues). Best-effort, like the CLI path. */
  private async applyLabels(prNumber: number, labels: string[]): Promise<void> {
    const res = await this.fetchImpl(
      `${API}/repos/${this.repoPath()}/issues/${prNumber}/labels`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ labels }),
      },
    );
    if (!res.ok) {
      logger.warn(
        `PR created, but labels could not be applied (HTTP ${res.status})`,
      );
    }
  }
}
