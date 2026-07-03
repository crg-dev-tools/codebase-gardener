import { createSign } from "node:crypto";

export interface AppCredentials {
  /** GitHub App ID (numeric, as a string is fine). */
  appId: string;
  /** PEM-encoded RSA private key for the App. */
  privateKey: string;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build a short-lived RS256 JWT for authenticating AS a GitHub App (used to
 * then mint an installation token). `nowSeconds` is injected for testability.
 * The App JWT is valid for ~10 minutes; we backdate `iat` by 60s to tolerate
 * clock skew, per GitHub's guidance.
 */
export function buildAppJwt(
  creds: AppCredentials,
  nowSeconds: number,
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: creds.appId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(creds.privateKey));
  return `${signingInput}.${signature}`;
}

/**
 * Exchange an App JWT for a repo-scoped installation access token via the
 * GitHub REST API. `fetchImpl` is injectable for testing; defaults to global
 * fetch. This is the credential source a future GitHub App / worker deployment
 * uses instead of the ambient `gh` login.
 */
export async function mintInstallationToken(
  creds: AppCredentials,
  installationId: string,
  nowSeconds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const jwt = buildAppJwt(creds, nowSeconds);
  const res = await fetchImpl(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `failed to mint installation token (HTTP ${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("installation token response had no token");
  return body.token;
}
