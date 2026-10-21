import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { SecretsService } from "#/api/secrets-service";
import {
  GITHUB_CLONE_SECRET_NAME,
  mintGithubCloneToken,
} from "#/api/git-service/mint-local-github-clone-credential";

const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_REPOS_URL = "https://api.github.com/repos";

export type GithubCredentialStatus = "ok" | "rejected" | "missing" | "unknown";

/** The agent-server's stored GitHub credential: null when none, "error" when unreadable. */
async function readStoredGithubToken(): Promise<string | null | "error"> {
  const secrets = await SecretsService.getSecrets();
  if (!secrets.some((secret) => secret.name === GITHUB_CLONE_SECRET_NAME)) {
    return null;
  }
  try {
    const token = await new SettingsClient(
      getAgentServerClientOptions(),
    ).getSecret(GITHUB_CLONE_SECRET_NAME);
    return token || null;
  } catch {
    return "error";
  }
}

async function githubStatus(
  url: string,
  token: string,
): Promise<number | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    return response.status;
  } catch {
    return null;
  }
}

/**
 * Whether GitHub still accepts the credential automation runs are given
 * (the agent-server's GITHUB_TOKEN secret).
 *
 * Benchmarked against Devin (case-studies/automations, scenario A8): the
 * stored GitHub OAuth token had been revoked, every run inherited it, and the
 * failures read as generic authentication errors -- one even hid that the
 * repository did not exist. GitHub OAuth tokens do not expire, so a 401 means
 * the connection itself is gone and only reconnecting GitHub fixes it; the app
 * now says so up front.
 *
 * "unknown" covers network errors and rate limits, which say nothing about
 * the credential and must not raise a false alarm.
 */
export async function checkGithubCredential(): Promise<GithubCredentialStatus> {
  const token = await readStoredGithubToken();
  if (token === "error") return "unknown";
  if (token !== null) {
    const status = await githubStatus(GITHUB_USER_URL, token);
    if (status === 200) return "ok";
    if (status !== 401) return "unknown";
  }
  // The agent-server only holds a copy of the user's GitHub login, written
  // when a repo conversation starts. After a reconnect that copy is still the
  // old, revoked token, so the banner kept asking for a reconnect the user
  // had already done. Refresh the copy from the saved connection first and
  // only report "rejected" when the saved login itself is refused.
  const healed = await refreshStoredGithubToken(token);
  if (healed) return healed;
  return token === null ? "missing" : "rejected";
}

async function refreshStoredGithubToken(
  staleToken: string | null,
): Promise<GithubCredentialStatus | null> {
  // With no copy at all, only ask when the app already knows GitHub is
  // connected, so users without GitHub do not call the Edge Function every
  // ten minutes.
  const fresh = await mintGithubCloneToken({
    evenIfNotFlaggedConnected: staleToken !== null,
  });
  if (!fresh || fresh.token === staleToken) return null;
  // Enterprise hosts are checked by the connection's own health sweep.
  if (fresh.host !== "github.com") return null;
  const status = await githubStatus(GITHUB_USER_URL, fresh.token);
  if (status !== 200) return null;
  try {
    await SecretsService.createSecret(
      GITHUB_CLONE_SECRET_NAME,
      fresh.token,
      "GitHub clone credential (auto-managed)",
    );
  } catch {
    return "unknown";
  }
  return "ok";
}

export type GithubRepositoryStatus = "exists" | "missing" | "unknown";

/**
 * Whether an owner/repo exists and the stored GitHub credential can see it.
 *
 * Benchmark A8: an automation for a repository that did not exist was saved
 * without complaint and only failed at run time; Devin's picker cannot offer
 * such a repository. Only a definite 404 with a working credential counts as
 * missing -- without a credential a private repository also answers 404, and
 * a rejected credential is already reported by the health banner, so neither
 * may block saving.
 */
export async function checkGithubRepository(
  slug: string,
): Promise<GithubRepositoryStatus> {
  const token = await readStoredGithubToken();
  if (token === null || token === "error") return "unknown";
  const status = await githubStatus(`${GITHUB_REPOS_URL}/${slug}`, token);
  if (status === 200) return "exists";
  return status === 404 ? "missing" : "unknown";
}

const GITHUB_USER_REPOS_URL =
  "https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member";

/**
 * The repositories the stored GitHub credential can see, most recently pushed
 * first, as owner/repo. Suggestions for the repository field so it works like
 * Devin's repository picker; empty when there is no working credential, and
 * the field stays free text either way.
 */
export async function listGithubRepositories(): Promise<string[]> {
  const token = await readStoredGithubToken();
  if (token === null || token === "error") return [];
  try {
    const response = await fetch(GITHUB_USER_REPOS_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) return [];
    const repos = (await response.json()) as { full_name?: unknown }[];
    return repos
      .map((repo) => repo.full_name)
      .filter((name): name is string => typeof name === "string");
  } catch {
    return [];
  }
}
