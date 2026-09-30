import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PluginsManagementService from "#/api/plugins-management-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  PLUGINS_QUERY_KEYS,
  SKILLS_QUERY_KEYS,
} from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

/**
 * Update an installed plugin from its source. Version / resolved coordinates may
 * change, so the installed list is invalidated on success, scoped to the
 * backend the mutation actually ran against. A refresh can also add, remove, or
 * change the plugin's bundled skills, so the skills catalog is invalidated too
 * — otherwise the Skills page can serve up to 10 minutes of stale data (see
 * `useSkills`'s `staleTime`).
 *
 * `meta.disableToast` keeps the global MutationCache handler from stacking a
 * second identical toast on top of the one below (same pattern as
 * `useInstallPlugin`).
 */
export function useRefreshPlugin() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();

  return useMutation({
    meta: { disableToast: true },
    mutationFn: (name: string) => PluginsManagementService.refreshPlugin(name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PLUGINS_QUERY_KEYS.installed(backend.id),
      });
      queryClient.invalidateQueries({
        queryKey: SKILLS_QUERY_KEYS.all(backend.id),
      });
      displaySuccessToast(t(I18nKey.SETTINGS$PLUGINS_REFRESH_SUCCESS));
    },
    onError: (error) => {
      displayErrorToast(
        retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
        { error },
      );
    },
  });
}
