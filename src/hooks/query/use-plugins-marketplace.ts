import { useQuery } from "@tanstack/react-query";
import PluginsService, { type MarketplacePlugin } from "#/api/plugins-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { PLUGINS_QUERY_KEYS } from "./query-keys";

/**
 * Query hook for the dynamic plugins marketplace catalog. The catalog is global
 * (not project-scoped), and currently local-backend only — a cloud backend
 * yields an empty list. Mirrors `useSkills`. Keyed by the active backend's id
 * so switching backends fetches fresh data instead of serving a stale catalog.
 */
export const usePluginsMarketplace = () => {
  const { backend } = useActiveBackend();
  return useQuery<MarketplacePlugin[]>({
    queryKey: PLUGINS_QUERY_KEYS.marketplace(backend.id),
    queryFn: () => PluginsService.getPluginsMarketplace(),
    staleTime: 1000 * 60 * 10, // 10 minutes – catalog rarely changes
    refetchOnWindowFocus: false,
  });
};
