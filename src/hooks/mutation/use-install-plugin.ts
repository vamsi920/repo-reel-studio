import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PluginsManagementService, {
  type InstallPluginRequest,
} from "#/api/plugins-management-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { PLUGINS_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

/**
 * Install a plugin from a git source or local path. Installing flips a catalog
 * entry from available to installed, so both the installed list and the
 * marketplace catalog are invalidated on success, scoped to the backend the
 * mutation actually ran against.
 *
 * Errors are toasted here once (`meta.disableToast` keeps the global
 * MutationCache handler from stacking a second identical toast); the add
 * modal also renders the same message inline so the user can correct the
 * source without the modal closing.
 */
export function useInstallPlugin() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();

  return useMutation({
    meta: { disableToast: true },
    mutationFn: (request: InstallPluginRequest) =>
      PluginsManagementService.installPlugin(request),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PLUGINS_QUERY_KEYS.installed(backend.id),
      });
      queryClient.invalidateQueries({
        queryKey: PLUGINS_QUERY_KEYS.marketplace(backend.id),
      });
      displaySuccessToast(t(I18nKey.SETTINGS$PLUGINS_INSTALL_SUCCESS));
    },
    onError: (error) => {
      displayErrorToast(
        retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
        { error },
      );
    },
  });
}
