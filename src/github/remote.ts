export interface OwnerRepo {
  owner: string;
  repo: string;
}

/**
 * Parse the `owner` and `repo` out of a GitHub remote URL. Handles the common
 * HTTPS and SSH forms, with or without a trailing `.git`. Returns null for
 * non-GitHub or unrecognizable URLs.
 */
export function parseOwnerRepo(remoteUrl: string): OwnerRepo | null {
  const url = remoteUrl.trim();

  // git@github.com:owner/repo(.git)
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  // https://github.com/owner/repo(.git)  or  ssh://git@github.com/owner/repo
  const https = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  if (https) return { owner: https[1], repo: https[2] };

  return null;
}
