import { useQuery } from "@tanstack/react-query";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { listGithubRepositories } from "#/api/git-service/github-credential-health";

export const GITHUB_REPOSITORY_SUGGESTIONS_QUERY_KEY = [
  "github-repository-suggestions",
] as const;

/** owner/repo suggestions for repository fields on local backends. */
export function useGithubRepositorySuggestions(): string[] {
  const { backend } = useActiveBackend();
  const { data } = useQuery({
    queryKey: [
      ...GITHUB_REPOSITORY_SUGGESTIONS_QUERY_KEY,
      backend.id,
      backend.connectionRevision ?? 0,
    ],
    queryFn: listGithubRepositories,
    enabled: backend.kind === "local",
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  return data ?? [];
}
