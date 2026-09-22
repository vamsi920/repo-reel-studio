import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useNavigation } from "#/context/navigation-context";
import {
  useCancelAutomationRun,
  useDispatchAutomation,
  useToggleAutomation,
} from "#/hooks/query/use-automations";
import { useHasPermission } from "#/hooks/use-has-permission";
import { isHomeAutomationsDemoEnabled } from "#/fixtures/home-automations-demo";
import { I18nKey } from "#/i18n/declaration";
import {
  AutomationRunStatus,
  type Automation,
  type AutomationRun,
} from "#/types/automation";
import { getApiErrorMessage } from "#/utils/api-error-message";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

export function isInFlightAutomationRun(
  run: AutomationRun | null | undefined,
): boolean {
  return (
    run?.status === AutomationRunStatus.PENDING ||
    run?.status === AutomationRunStatus.RUNNING
  );
}

/**
 * Shared home-surface actions for pinned cards and activity rows:
 * run now, view, edit (local), turn off (with confirm), cancel in-flight.
 */
export function useHomeAutomationActions(
  automation: Automation,
  latestRun: AutomationRun | null,
) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const active = useActiveBackend();
  const canManage = useHasPermission("manage_automations");
  const canEdit = active.backend.kind === "local";
  const isDemo = isHomeAutomationsDemoEnabled();

  const dispatchMutation = useDispatchAutomation();
  const toggleMutation = useToggleAutomation();
  const cancelMutation = useCancelAutomationRun();

  const [editOpen, setEditOpen] = useState(false);
  const [turnOffConfirmOpen, setTurnOffConfirmOpen] = useState(false);

  const isRunPending =
    dispatchMutation.isPending && dispatchMutation.variables === automation.id;
  const isCancelPending =
    cancelMutation.isPending &&
    cancelMutation.variables?.runId === latestRun?.id;
  const canCancel = canManage && isInFlightAutomationRun(latestRun);

  const runNow = useCallback(async () => {
    if (isDemo) {
      displaySuccessToast(t(I18nKey.AUTOMATIONS$RUN_NOW_SUCCESS));
      return;
    }
    try {
      // `mutateAsync` returns this call's own promise, unlike `.mutate()`
      // whose per-call onSuccess/onError get dropped by react-query's
      // shared mutation observer when a second call fires before the first
      // settles (see the same fix already applied to automation-detail.tsx
      // and automations-list.tsx's sibling handlers).
      await dispatchMutation.mutateAsync(automation.id);
      displaySuccessToast(t(I18nKey.AUTOMATIONS$RUN_NOW_SUCCESS));
    } catch (error) {
      displayErrorToast(
        getApiErrorMessage(error, t(I18nKey.AUTOMATIONS$RUN_NOW_ERROR)),
      );
    }
  }, [automation.id, dispatchMutation, isDemo, t]);

  const viewDetails = useCallback(() => {
    navigate?.(`/automations/${automation.id}`);
  }, [automation.id, navigate]);

  const openEdit = useCallback(() => {
    if (!canEdit) {
      viewDetails();
      return;
    }
    setEditOpen(true);
  }, [canEdit, viewDetails]);

  const requestTurnOff = useCallback(() => {
    setTurnOffConfirmOpen(true);
  }, []);

  const confirmTurnOff = useCallback(async () => {
    setTurnOffConfirmOpen(false);
    if (isDemo) return;
    try {
      await toggleMutation.mutateAsync({ id: automation.id, enabled: false });
    } catch (error) {
      displayErrorToast(
        getApiErrorMessage(error, t(I18nKey.AUTOMATIONS$TURN_OFF_ERROR)),
      );
    }
  }, [automation.id, isDemo, t, toggleMutation]);

  const cancelTurnOff = useCallback(() => {
    setTurnOffConfirmOpen(false);
  }, []);

  const cancelRun = useCallback(async () => {
    if (!latestRun || !isInFlightAutomationRun(latestRun)) return;
    if (isDemo) {
      displaySuccessToast(t(I18nKey.AUTOMATIONS$CANCEL_RUN_SUCCESS));
      return;
    }
    try {
      await cancelMutation.mutateAsync({
        automationId: automation.id,
        runId: latestRun.id,
      });
      displaySuccessToast(t(I18nKey.AUTOMATIONS$CANCEL_RUN_SUCCESS));
    } catch (error) {
      displayErrorToast(
        getApiErrorMessage(error, t(I18nKey.AUTOMATIONS$CANCEL_RUN_ERROR)),
      );
    }
  }, [automation.id, cancelMutation, isDemo, latestRun, t]);

  return {
    canManage,
    canEdit,
    isRunPending,
    isCancelPending,
    canCancel,
    editOpen,
    setEditOpen,
    turnOffConfirmOpen,
    runNow,
    viewDetails,
    openEdit,
    requestTurnOff,
    confirmTurnOff,
    cancelTurnOff,
    cancelRun,
  };
}
