import type { GitClient } from "../git/client";
import { logger } from "../logger";
import { mintInstallationToken } from "./appAuth";
import { AppGithubClient } from "./appClient";
import { type GithubClient, GhCliClient } from "./client";
import { parseOwnerRepo } from "./remote";

export type GithubBackend = "cli" | "app";

/** True when GitHub App credentials are present in the environment. */
export function appConfigured(): boolean {
  return Boolean(
    process.env.GARDENER_GH_APP_ID &&
      process.env.GARDENER_GH_APP_PRIVATE_KEY &&
      process.env.GARDENER_GH_INSTALLATION_ID,
  );
}

/**
 * Select the GitHub backend. Defaults to the `gh` CLI (ambient login). When
 * GitHub App env vars are set, mints an installation token and returns the
 * REST-based App client instead — the Phase 3 path. Callers depend only on the
 * GithubClient interface, so nothing else changes.
 *
 * `nowSeconds` is injected for testability of the token path.
 */
export async function createGithubClient(
  git: GitClient,
  cwd: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<GithubClient> {
  const forced = process.env.GARDENER_GITHUB_BACKEND as GithubBackend | undefined;

  if (forced !== "cli" && (forced === "app" || appConfigured())) {
    const remote = await git.remoteUrl();
    const ownerRepo = remote ? parseOwnerRepo(remote) : null;
    if (!ownerRepo) {
      throw new Error(
        "GitHub App backend requires an origin remote pointing at github.com",
      );
    }
    const token = await mintInstallationToken(
      {
        appId: process.env.GARDENER_GH_APP_ID as string,
        privateKey: process.env.GARDENER_GH_APP_PRIVATE_KEY as string,
      },
      process.env.GARDENER_GH_INSTALLATION_ID as string,
      nowSeconds,
    );
    logger.debug(`github backend: app (${ownerRepo.owner}/${ownerRepo.repo})`);
    return new AppGithubClient(token, ownerRepo);
  }

  logger.debug("github backend: gh CLI");
  return new GhCliClient(cwd);
}
