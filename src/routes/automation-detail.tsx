import { useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import { getErrorStatus } from "#/hooks/query/use-settings";
import { useAutomationDetail } from "#/hooks/query/use-automation-detail";
import {
  useToggleAutomation,
  useDeleteAutomation,
  useDispatchAutomation,
} from "#/hooks/query/use-automations";
import { useAutomationHealth } from "#/hooks/query/use-automation-health";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useNavigation } from "#/context/navigation-context";
import { automationListPath } from "#/manifests/automation-interface";
import { BackLink } from "#/components/features/automations/detail/back-link";
import { DetailHeader } from "#/components/features/automations/detail/detail-header";
import { PromptSection } from "#/components/features/automations/detail/prompt-section";
import { ConfigurationSection } from "#/components/features/automations/detail/configuration-section";
import { PluginsSection } from "#/components/features/automations/detail/plugins-section";
import { ActivitySection } from "#/components/features/automations/detail/activity-section";
import { ActivityLogSection } from "#/components/features/automations/detail/activity-log-section";
import { DetailSkeleton } from "#/components/features/automations/detail/detail-skeleton";
import { NotFoundState } from "#/components/features/automations/detail/not-found-state";
import { ErrorState } from "#/components/features/automations/error-state";
import { BackendNotConfigured } from "#/components/features/automations/backend-not-configured";
import { DeleteConfirmationModal } from "#/components/features/automations/delete-confirmation-modal";
import { EditAutomationModal } from "#/components/features/automations/detail/edit-automation-modal";
import { useTracking } from "#/hooks/use-tracking";
import AutomationService from "#/api/automation-service/automation-service.api";
import { parseProactivationMarker } from "#/utils/proactivation-prompt";
import { ProactivationSummaryBanner } from "#/components/features/automations/proactivation/proactivation-summary-banner";
import {
  getAutomationExportFilename,
  serializeAutomation,
} from "#/utils/automation-export";
import { downloadBlob } from "#/utils/utils";

export default function AutomationDetail() {
  const { t } = useTranslation("openhands");
  const { automationId } = useParams();
  const [searchParams] = useSearchParams();
  const highlightedRunId = searchParams.get("run");
  const { navigate } = useNavigation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const {
    data: healthData,
    isLoading: isHealthLoading,
    refetch: refetchHealth,
  } = useAutomationHealth();

  const isBackendHealthy = healthData?.status === "ok";

  // The automationId in the URL belongs to whichever backend was active
  // when the page first mounted. If the user switches backends, the id
  // is meaningless under the new backend — disable the query so we
  // don't fire a request that the backend selector's redirect will
  // immediately navigate away from anyway.
  const active = useActiveBackend();
  const mountedBackendId = useRef(active.backend.id);
  const backendChanged = mountedBackendId.current !== active.backend.id;

  // Only fetch automation details if the backend is healthy and hasn't changed
  const {
    data: automation,
    isLoading,
    isError,
    error,
    refetch,
  } = useAutomationDetail({
    id: automationId ?? "",
    enabled: isBackendHealthy && !backendChanged,
  });

  const { trackPrebuiltAutomationEnabled, trackAutomationExported } =
    useTracking();
  const toggleMutation = useToggleAutomation();
  const deleteMutation = useDeleteAutomation();
  const dispatchMutation = useDispatchAutomation();

  const is404 = isError && getErrorStatus(error) === 404;

  // The backend switch may not navigate at all (e.g. picking a different
  // backend from the "Manage Backends" modal while this page is mounted
  // calls `setActive` directly, with no redirect). Disabling the query
  // above isn't enough on its own: `automation` still holds the previous
  // backend's cached object, so without this guard the page would keep
  // rendering that stale automation — and any action on it — under the
  // new backend's identity. Mirrors the same guard in `routes/conversation.tsx`.
  if (backendChanged) {
    return null;
  }

  // Show loading state while checking health
  if (isHealthLoading) {
    return (
      <div className="min-h-full">
        <div className="p-6 max-w-4xl mx-auto">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  // Show backend not configured state if health check failed
  if (!isBackendHealthy) {
    return (
      <div className="min-h-full">
        <div className="p-6 max-w-4xl mx-auto">
          <BackendNotConfigured onRetry={refetchHealth} />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-full">
        <div className="p-6 max-w-4xl mx-auto">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className="min-h-full">
        <div className="p-6 max-w-4xl mx-auto">
          <NotFoundState />
        </div>
      </div>
    );
  }

  if (isError || !automation) {
    return (
      <div className="min-h-full">
        <div className="p-6 max-w-4xl mx-auto">
          <ErrorState onRetry={() => refetch()} />
        </div>
      </div>
    );
  }

  const handleToggle = async () => {
    const willEnable = !automation.enabled;
    if (willEnable) {
      trackPrebuiltAutomationEnabled({
        automationId: automation.id,
        automationName: automation.name,
      });
    }
    try {
      // A second toggle click before the first settles used to drop the
      // first call's `onError` (react-query's mutation observer keeps only
      // the latest call's per-call callbacks), leaving the switch snapped
      // back with no explanation. `mutateAsync` returns this specific
      // call's own promise, so awaiting it here is safe under concurrency.
      await toggleMutation.mutateAsync({
        id: automation.id,
        enabled: willEnable,
      });
    } catch (error) {
      displayErrorToast(
        getApiErrorMessage(
          error,
          t(
            willEnable
              ? I18nKey.AUTOMATIONS$EDIT_ERROR
              : I18nKey.AUTOMATIONS$TURN_OFF_ERROR,
          ),
        ),
      );
    }
  };

  const handleDelete = async () => {
    try {
      // Same drop-callback race as `handleToggle` above: a re-entrant click
      // on the same mutation instance before the first settles must not
      // silently swallow either call's outcome, so this awaits its own
      // promise instead of relying on the shared per-call callbacks.
      await deleteMutation.mutateAsync(automation.id);
      navigate?.(automationListPath());
    } catch (error) {
      // A failed delete used to leave the confirmation modal sitting open
      // with nothing to say. Close it and report why the automation is
      // still here.
      setShowDeleteModal(false);
      displayErrorToast(getApiErrorMessage(error, t(I18nKey.ERROR$GENERIC)));
    }
  };

  const handleRunNow = async () => {
    try {
      await dispatchMutation.mutateAsync(automation.id);
      displaySuccessToast(t(I18nKey.AUTOMATIONS$RUN_NOW_SUCCESS));
    } catch (error) {
      displayErrorToast(
        getApiErrorMessage(error, t(I18nKey.AUTOMATIONS$RUN_NOW_ERROR)),
      );
    }
  };

  // `downloadTarball` is async: returning its promise to the menu left a
  // rejected download as an unhandled rejection and a menu click that did
  // nothing at all.
  const handleDownloadTarball = () => {
    void AutomationService.downloadTarball(
      automation.id,
      automation.name,
    ).catch((error: unknown) => {
      displayErrorToast(getApiErrorMessage(error, t(I18nKey.ERROR$GENERIC)));
    });
  };

  const handleExport = () => {
    const contents = `${JSON.stringify(serializeAutomation(automation), null, 2)}\n`;
    downloadBlob(
      new Blob([contents], { type: "application/json" }),
      getAutomationExportFilename(automation),
    );
    trackAutomationExported({ backendKind: active.backend.kind });
  };

  // Edit is a local-backend-only feature in MVP — cloud automations
  // are managed elsewhere and we don't yet surface them here.
  const canEdit = active.backend.kind === "local";
  const proactivationConfig = parseProactivationMarker(automation.prompt);

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex flex-col gap-4">
          <BackLink />
          {proactivationConfig && (
            <ProactivationSummaryBanner config={proactivationConfig} />
          )}
          <DetailHeader
            automation={automation}
            onToggle={handleToggle}
            onEdit={canEdit ? () => setShowEditModal(true) : undefined}
            onDelete={() => setShowDeleteModal(true)}
            onExport={handleExport}
            onDownloadTarball={handleDownloadTarball}
            onRunNow={handleRunNow}
            isRunningNow={dispatchMutation.isPending}
          />
          {automation.prompt && <PromptSection prompt={automation.prompt} />}
          <ConfigurationSection automation={automation} />
          {automation.plugins && automation.plugins.length > 0 && (
            <PluginsSection plugins={automation.plugins} />
          )}
          <ActivitySection
            createdAt={automation.created_at}
            lastRunAt={automation.last_triggered_at}
          />
          <ActivityLogSection
            // Force a remount on automation change: the route doesn't
            // change shape when only `:automationId` changes, so without a
            // key the section's local pagination `limit` and
            // `scrolledToRunIdRef` would carry over from the previous
            // automation instead of resetting to the first page.
            key={automation.id}
            automation={automation}
            highlightedRunId={highlightedRunId}
          />
          <DeleteConfirmationModal
            automationName={automation.name}
            isOpen={showDeleteModal}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteModal(false)}
          />
          {canEdit && (
            <EditAutomationModal
              automation={automation}
              isOpen={showEditModal}
              onClose={() => setShowEditModal(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
