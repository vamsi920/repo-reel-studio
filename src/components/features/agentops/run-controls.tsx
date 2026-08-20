import { useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { DangerModal } from "#/components/shared/modals/confirmation-modals/danger-modal";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import { useAgentOpsRunControl } from "#/hooks/query/use-agentops";
import type { AgentOpsRun } from "#/api/agentops-service/agentops-service.types";

/**
 * Pause / Resume / Stop for a run.
 *
 * Every button here reaches the OpenHands agent-server for real, through the
 * collector: Pause and Stop call `/interrupt`, Resume calls `/run`. A control
 * whose precondition isn't met is **not rendered** rather than rendered
 * disabled — a greyed-out button still implies the capability exists, and a
 * control tower must not show controls that don't do anything.
 *
 * Stop is destructive (the agent loses its turn), so it confirms first.
 */

const BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--background-secondary)] disabled:cursor-not-allowed disabled:opacity-50";

interface RunControlsProps {
  run: AgentOpsRun;
}

export function RunControls({ run }: RunControlsProps) {
  const { t } = useTranslation("openhands");
  const { mutate: controlRun, isPending } = useAgentOpsRunControl();
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);

  // Only a run the runtime is actually working on can be paused or stopped;
  // only a halted-but-unfinished run can be resumed.
  const canPause = run.status === "running" || run.status === "stuck";
  const canResume = run.status === "paused" || run.status === "idle";
  const canStop = run.status !== "finished" && run.status !== "error";

  const invoke = (action: "pause" | "resume" | "cancel") =>
    controlRun(
      { runId: run.runId, action },
      {
        onError: (error) =>
          displayErrorToast(
            getApiErrorMessage(
              error,
              t(I18nKey.AGENTOPS$CONTROL_FAILED, { action }),
            ),
          ),
      },
    );

  return (
    <div
      data-testid="agentops-run-controls"
      className="flex items-center gap-2"
    >
      {canPause ? (
        <button
          type="button"
          data-testid="agentops-run-pause"
          className={BUTTON_CLASS}
          disabled={isPending}
          onClick={() => invoke("pause")}
        >
          <Pause size={14} />
          {t(I18nKey.AGENTOPS$CONTROL_PAUSE)}
        </button>
      ) : null}

      {canResume ? (
        <button
          type="button"
          data-testid="agentops-run-resume"
          className={BUTTON_CLASS}
          disabled={isPending}
          onClick={() => invoke("resume")}
        >
          <Play size={14} />
          {t(I18nKey.AGENTOPS$CONTROL_RESUME)}
        </button>
      ) : null}

      {canStop ? (
        <button
          type="button"
          data-testid="agentops-run-stop"
          className={`${BUTTON_CLASS} text-[var(--error-500)]`}
          disabled={isPending}
          onClick={() => setConfirmStopOpen(true)}
        >
          <Square size={14} />
          {t(I18nKey.AGENTOPS$CONTROL_STOP)}
        </button>
      ) : null}

      {confirmStopOpen ? (
        <ModalBackdrop onClose={() => setConfirmStopOpen(false)}>
          <DangerModal
            testId="agentops-stop-confirmation"
            title={t(I18nKey.AGENTOPS$CONTROL_STOP_CONFIRM_TITLE)}
            description={t(I18nKey.AGENTOPS$CONTROL_STOP_CONFIRM_BODY, {
              task: run.task,
            })}
            buttons={{
              danger: {
                text: t(I18nKey.AGENTOPS$CONTROL_STOP_CONFIRM_ACTION),
                onClick: () => {
                  setConfirmStopOpen(false);
                  invoke("cancel");
                },
              },
              cancel: {
                text: t(I18nKey.BUTTON$CANCEL),
                onClick: () => setConfirmStopOpen(false),
              },
            }}
          />
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
