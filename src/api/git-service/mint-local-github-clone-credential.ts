import { Provider } from "#/types/settings";
import { SecretsService } from "#/api/secrets-service";
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { isLocalGithubConnected } from "#/api/git-service/github-connection-flag";

export const GITHUB_CLONE_SECRET_NAME = "GITHUB_TOKEN";

/**
 * The self-hosted agent-server has no route back to Supabase, so the only
 * way to get a locally-connected GitHub token into its sandbox is a brief
 * browser pass-through: mint the decrypted token and save it straight into
 * the agent-server's own secret store. The token variable is discarded
 * immediately after -- never persisted, never logged. See
 * supabase/functions/github-mint-clone-credential.
 *
 * Shared by every flow that can attach a GitHub repo to a local-backend
 * sandbox (conversation creation, and the in-conversation "Connect Repo"
 * flow) so the credential is minted the same way regardless of when the
 * repo is attached.
 *
 * Returns the git host (e.g. "github.com") on success, or null if no
 * credential was minted -- either because none was needed (not GitHub, no
 * local connection, cloud backend) or because minting/storing it failed.
 */
export async function mintLocalGithubCloneCredential(
  gitProvider: Provider,
): Promise<string | null> {
  if (gitProvider !== "github") return null;

  const credential = await mintGithubCloneToken();
  if (!credential) return null;

  try {
    await SecretsService.createSecret(
      GITHUB_CLONE_SECRET_NAME,
      credential.token,
      "GitHub clone credential (auto-managed)",
    );
  } catch {
    return null;
  }

  return credential.host;
}

/**
 * The same one-shot decrypted-token handoff as above, without the
 * agent-server secret-store write -- for callers that need the raw token
 * immediately (e.g. to pass straight through to another HTTP request) rather
 * than stashing it for a sandbox to read later. Never persist or log the
 * returned token. See #/lib/knowledge/deepwiki-repo-target.ts for the other
 * consumer of this.
 */
export async function mintGithubCloneToken(): Promise<{
  token: string;
  host: string;
} | null> {
  if (!isLocalGithubConnected() || !isSupabaseConfigured || !supabase) {
    return null;
  }

  const { data, error } = await supabase.functions.invoke<{
    token: string;
    host: string;
  }>("github-mint-clone-credential", { body: {} });
  if (error || !data?.token || !data?.host) return null;

  return data;
}
