import React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import {
  useTestStudioStore,
  type TestProject,
} from "#/stores/test-studio-store";
import AutomationService from "#/api/automation-service/automation-service.api";
import { AUTOMATIONS_QUERY_KEY } from "#/hooks/query/use-automations";
import { buildGitHubEventTrigger } from "#/utils/automation-event-trigger";
import type { SetupRequestBody } from "#/manifests/types";
import { HARNESS_PATH, PLAN_PATH, REPORT_MD_PATH } from "#/lib/testing/harness";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";

/** Nightly at 02:00 local time. */
export const NIGHTLY_CRON = "0 2 * * *";

/**
 * The prompt a scheduled run gets: run the harness the project already has,
 * read status.json, and report. Plain prose for the agent, not UI copy.
 */
export function buildSchedulePrompt(project: TestProject): string {
  return [
    `Run the Neo Test plan of "${project.name}" and report the results.`,
    "",
    `1. In the repository root, run: node ${HARNESS_PATH} --plan ${PLAN_PATH} --run scheduled-$(date +%Y%m%d-%H%M)`,
    `   If ${HARNESS_PATH} or ${PLAN_PATH} is missing, stop and report FAILED: the Neo Test studio has not written them to this checkout.`,
    "2. Read .neotest/runs/<run id>/status.json: for every suite report its status, exit code and duration, and quote the failing tests from the artifacts (JUnit/JSON) it copied.",
    `3. Update ${REPORT_MD_PATH} with a short dated section at the top: suites passed/failed, failing tests, and whether the result changed since the previous section.`,
    "4. Never edit application code or tests in this run; only report. Never claim numbers the artifacts do not contain.",
  ].join("\n");
}

export function ScheduleCard({ project }: { project: TestProject }) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const setSchedule = useTestStudioStore((s) => s.setSchedule);
  const [busy, setBusy] = React.useState(false);
  const isRepo = project.source.kind === "repository";
  const [mode, setMode] = React.useState<"nightly" | "push">("nightly");

  const create = async () => {
    setBusy(true);
    try {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const trigger: SetupRequestBody["trigger"] =
        mode === "push" && isRepo
          ? buildGitHubEventTrigger(
              "push",
              project.source.name,
              project.source.branch,
            )
          : { type: "cron", schedule: NIGHTLY_CRON, timezone };
      const name = `Neo Test: ${project.name}`;
      const body: SetupRequestBody = {
        name,
        prompt: buildSchedulePrompt(project),
        trigger,
        enabled: true,
        ...(isRepo
          ? { repos: [{ url: project.source.name, provider: "github" }] }
          : {}),
      };
      const created = await AutomationService.createAutomationDraft(body);
      await queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      const id = typeof created.id === "string" ? created.id : "";
      setSchedule(project.id, {
        automationId: id,
        name,
        kind: mode === "push" && isRepo ? "event" : "cron",
        description:
          mode === "push" && isRepo
            ? t(I18nKey.TESTING$SCHEDULE_ON_PUSH)
            : t(I18nKey.TESTING$SCHEDULE_NIGHTLY),
        createdAt: new Date().toISOString(),
      });
      displaySuccessToast(t(I18nKey.TESTING$SCHEDULE_CREATED));
    } catch (error) {
      displayErrorToast(
        getApiErrorMessage(error, t(I18nKey.TESTING$SCHEDULE_ERROR)),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      data-testid="testing-schedule"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <CalendarClock size={12} aria-hidden />{" "}
        {t(I18nKey.TESTING$SCHEDULE_TITLE)}
      </span>
      {project.schedule ? (
        <p
          data-testid="testing-schedule-active"
          className="flex items-center gap-2 text-sm text-[var(--text-primary)]"
        >
          <Check
            size={14}
            aria-hidden
            className="text-[var(--success-600,#15803d)]"
          />
          {project.schedule.description}
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
            {project.schedule.automationId}
          </span>
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--text-secondary)]">
            {t(I18nKey.TESTING$SCHEDULE_HINT)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t(I18nKey.TESTING$SCHEDULE_TITLE)}
              value={mode}
              onChange={(e) => setMode(e.target.value as "nightly" | "push")}
              className="ame-input rounded border border-[var(--border-color)] bg-transparent px-2 py-1 text-xs"
            >
              <option value="nightly">
                {t(I18nKey.TESTING$SCHEDULE_NIGHTLY)}
              </option>
              {isRepo ? (
                <option value="push">
                  {t(I18nKey.TESTING$SCHEDULE_ON_PUSH)}
                </option>
              ) : null}
            </select>
            <button
              type="button"
              data-testid="testing-schedule-create"
              disabled={busy || project.plan.length === 0}
              onClick={() => void create()}
              className="ame-btn-secondary ame-btn-xs"
            >
              {t(I18nKey.TESTING$SCHEDULE_CREATE)}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
