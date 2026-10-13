import { useQuery } from "@tanstack/react-query";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  checkGithubCredential,
  type GithubCredentialStatus,
} from "#/api/git-service/github-credential-health";

export const GITHUB_CREDENTIAL_HEALTH_QUERY_KEY = [
  "github-credential-health",
] as const;

/**
 * Whether GitHub accepts the credential local automation runs use. Checked on
 * local backends only (a Cloud backend manages its own GitHub access), at most
 * every ten minutes. Null while unknown.
 */
export function useGithubCredentialHealth(): GithubCredentialStatus | null {
  const { backend } = useActiveBackend();
  const { data } = useQuery({
    queryKey: [
      ...GITHUB_CREDENTIAL_HEALTH_QUERY_KEY,
      backend.id,
      backend.connectionRevision ?? 0,
    ],
    queryFn: checkGithubCredential,
    enabled: backend.kind === "local",
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: false,
  });
  return data ?? null;
}
