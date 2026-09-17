import { useQuery } from "@tanstack/react-query";
import { githubConnectionsRepository } from "#/lib/data-platform/repositories/github-connections-repository";
import { useSupabaseSession } from "./use-supabase-session";

export const useGithubConnection = () => {
  const { status } = useSupabaseSession();

  return useQuery({
    queryKey: ["github-connection"],
    queryFn: () => githubConnectionsRepository.getConnection(),
    enabled: status === "real" || status === "none" || status === "anonymous", // Enable for local connections regardless of real Supabase session
    staleTime: 1000 * 60,
    retry: false,
    meta: { disableToast: true },
  });
};
