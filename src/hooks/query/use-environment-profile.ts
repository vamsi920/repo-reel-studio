import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { environmentProfileRepository } from "#/lib/data-platform/repositories/environment-profile-repository";
import type { EnvironmentProfile } from "#/lib/environment/types/profile";
import { createEmptyProfile } from "#/lib/environment/types/profile";
import { ENVIRONMENT_QUERY_KEYS } from "./query-keys";
import { useEnvironmentOrgId } from "./use-environment-org";

/**
 * Returns the stored profile, or a fresh default when this org has never
 * saved one. Returning a default rather than null keeps every consumer free
 * of null-checks and means an install that has not opened this screen still
 * renders as "hosted by us, no overrides", which is exactly what it is.
 */
export function useEnvironmentProfile() {
  const { data: orgId } = useEnvironmentOrgId();

  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.profile(orgId ?? undefined),
    queryFn: async (): Promise<EnvironmentProfile> => {
      if (!orgId) throw new Error("no org");
      const stored = await environmentProfileRepository.get(orgId);
      return stored ?? createEmptyProfile(orgId, new Date().toISOString());
    },
    enabled: Boolean(orgId),
    staleTime: 1000 * 30,
    retry: false,
    meta: { disableToast: true },
  });
}

export function useSaveEnvironmentProfile() {
  const queryClient = useQueryClient();
  const { data: orgId } = useEnvironmentOrgId();

  return useMutation({
    mutationFn: async (profile: EnvironmentProfile) => {
      if (!orgId) throw new Error("no org");
      return environmentProfileRepository.put(orgId, profile);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(
        ENVIRONMENT_QUERY_KEYS.profile(orgId ?? undefined),
        saved,
      );
      queryClient.invalidateQueries({
        queryKey: ENVIRONMENT_QUERY_KEYS.readiness(),
      });
    },
  });
}
