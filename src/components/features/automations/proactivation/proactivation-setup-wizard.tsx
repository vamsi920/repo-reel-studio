import { useMemo, useState } from "react";
import { isLocalGithubConnected } from "#/api/git-service/github-connection-flag";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { I18nKey } from "#/i18n/declaration";
import type { GitRepository } from "#/types/git";
import type { Provider } from "#/types/settings";
import { useUserProviders } from "#/hooks/use-user-providers";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { useResolvedWorkspaces } from "#/hooks/query/use-resolved-workspaces";
import { useWorkspaceMemoryStore } from "#/stores/workspace-memory-store";
import { GitProviderDropdown } from "#/components/features/home/git-provider-dropdown/git-provider-dropdown";
import { GitRepoDropdown } from "#/components/features/home/git-repo-dropdown/git-repo-dropdown";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { modalTitleLgMediumClassName } from "#/utils/modal-classes";
import { cn } from "#/utils/utils";
import { AUTOMATIONS_QUERY_KEY } from "#/hooks/query/use-automations";
import AutomationService from "#/api/automation-service/automation-service.api";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import {
  buildCronSchedule,
  type SchedulePresetKind,
} from "#/utils/automation-schedule";
import {
  buildProactivationPrompt,
  getWatchAreaLabel,
  PROACTIVATION_NAME_PREFIX,
  type ProactivationAutonomyLevel,
  type ProactivationWatchArea,
} from "#/utils/proactivation-prompt";
import type { AutomationSpec } from "#/types/automation";
import XMarkIcon from "#/icons/x-mark.svg?react";

interface ProactivationSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onEnabled: () => void;
}

const WATCH_AREAS: ProactivationWatchArea[] = [
  "dependency",
  "test",
  "ci",
  "documentation",
  "code-quality",
  "repository-health",
];

const WATCH_AREA_COPY_KEYS: Record<
  ProactivationWatchArea,
  { label: I18nKey; description: I18nKey }
> = {
  dependency: {
    label: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_DEPENDENCY,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_DEPENDENCY_DESC,
  },
  test: {
    label: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_TEST,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_TEST_DESC,
  },
  ci: {
    label: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_CI,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_CI_DESC,
  },
  documentation: {
    label: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_DOCUMENTATION,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_DOCUMENTATION_DESC,
  },
  "code-quality": {
    label: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_CODE_QUALITY,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_CODE_QUALITY_DESC,
  },
  "repository-health": {
    label: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_REPOSITORY_HEALTH,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_WATCH_REPOSITORY_HEALTH_DESC,
  },
};

const AUTONOMY_LEVELS: {
  value: ProactivationAutonomyLevel;
  label: I18nKey;
  description: I18nKey;
}[] = [
  {
    value: "recommend",
    label: I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_RECOMMEND_LABEL,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_RECOMMEND_DESC,
  },
  {
    value: "prepare-fix",
    label: I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_PREPARE_FIX_LABEL,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_PREPARE_FIX_DESC,
  },
  {
    value: "create-pr",
    label: I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_CREATE_PR_LABEL,
    description: I18nKey.AUTOMATIONS$PROACTIVATION_AUTONOMY_CREATE_PR_DESC,
  },
];

type Step =
  | "workspace"
  | "repositories"
  | "watch"
  | "autonomy"
  | "schedule"
  | "review";

const STEPS: Step[] = [
  "workspace",
  "repositories",
  "watch",
  "autonomy",
  "schedule",
  "review",
];

const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

function repoKey(repo: GitRepository): string {
  return `${repo.git_provider}:${repo.full_name}`;
}

export function ProactivationSetupWizard({
  isOpen,
  onClose,
  onEnabled,
}: ProactivationSetupWizardProps) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { providers } = useUserProviders();
  const activeWorkspaceId = useWorkspaceMemoryStore((s) => s.activeWorkspaceId);
  const { workspaces } = useResolvedWorkspaces();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    providers[0] ?? null,
  );
  // Repository search is a cloud-backend capability: on a local backend
  // `GitService` returns an empty page by design, so the dropdown would list
  // nothing and the wizard could never be completed. Fall back to typing
  // owner/repo, exactly as `manifest-form-field.tsx` does for repo-picker.
  const canListRepositories = useActiveBackend().backend.kind === "cloud" || isLocalGithubConnected();
  const [manualRepo, setManualRepo] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<GitRepository[]>([]);
  const [watchAreas, setWatchAreas] = useState<Set<ProactivationWatchArea>>(
    () => new Set(["dependency", "test", "code-quality"]),
  );
  const [autonomyLevel, setAutonomyLevel] =
    useState<ProactivationAutonomyLevel>("recommend");
  const [frequency, setFrequency] = useState<SchedulePresetKind>("daily");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  if (!isOpen) return null;

  const canGoNext = !(
    (step === "repositories" && selectedRepos.length === 0) ||
    (step === "watch" && watchAreas.size === 0)
  );

  const handleAddRepo = (repo?: GitRepository) => {
    if (!repo) return;
    setSelectedRepos((prev) =>
      prev.some((r) => repoKey(r) === repoKey(repo)) ? prev : [...prev, repo],
    );
  };

  const handleAddManualRepo = () => {
    const trimmed = manualRepo.trim().replace(/^\/+|\/+$/g, "");
    if (!trimmed) return;
    handleAddRepo({
      id: trimmed,
      full_name: trimmed,
      git_provider: selectedProvider ?? "github",
      is_public: false,
    });
    setManualRepo("");
  };

  const handleRemoveRepo = (repo: GitRepository) => {
    setSelectedRepos((prev) =>
      prev.filter((r) => repoKey(r) !== repoKey(repo)),
    );
  };

  const toggleWatchArea = (area: ProactivationWatchArea) => {
    setWatchAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));
  const goNext = () => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));

  const handleEnable = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const schedule = buildCronSchedule({
      kind: frequency,
      hour: DEFAULT_HOUR,
      minute: DEFAULT_MINUTE,
      weekday: frequency === "weekly" ? 1 : undefined,
    });
    const sortedWatchAreas = WATCH_AREAS.filter((a) => watchAreas.has(a));

    try {
      // Sequential, not parallel: each create is a two-request flow
      // (create-preset then PATCH the real trigger) against the same
      // automation service, and failures should stop cleanly rather than
      // leave a partial fan-out of half-created automations.
      for (const repo of selectedRepos) {
        const spec: AutomationSpec = {
          name: `${PROACTIVATION_NAME_PREFIX} — ${repo.full_name}`,
          prompt: buildProactivationPrompt({
            watchAreas: sortedWatchAreas,
            autonomyLevel,
            repository: repo.full_name,
          }),
          repository: repo.full_name,
          trigger: { type: "cron", schedule, timezone },
          timezone,
          enabled: true,
        };

        const created = await AutomationService.createAutomation(spec);

        await AutomationService.toggleAutomation(created.id, true);
      }

      await queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      displaySuccessToast(t(I18nKey.AUTOMATIONS$PROACTIVATION_ENABLE_SUCCESS));
      onEnabled();
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        t(I18nKey.AUTOMATIONS$PROACTIVATION_ENABLE_ERROR),
      );
      setSubmitError(message);
      displayErrorToast(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const frequencyItems = [
    { key: "daily", label: t(I18nKey.AUTOMATIONS$FREQUENCY_DAILY) },
    { key: "weekdays", label: t(I18nKey.AUTOMATIONS$FREQUENCY_WEEKDAYS) },
    { key: "weekly", label: t(I18nKey.AUTOMATIONS$FREQUENCY_WEEKLY) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") handleClose();
        }}
        role="presentation"
      />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-6">
        <button
          type="button"
          onClick={handleClose}
          disabled={isSubmitting}
          className="absolute right-4 top-4 text-muted hover:text-foreground"
          aria-label={t(I18nKey.AUTOMATIONS$PROACTIVATION_CANCEL)}
        >
          <XMarkIcon className="size-5" />
        </button>

        <h2 className={modalTitleLgMediumClassName}>
          {t(I18nKey.AUTOMATIONS$PROACTIVATION_WIZARD_TITLE)}
        </h2>
        <p className="mt-1 text-xs text-muted">
          {t(
            {
              workspace: I18nKey.AUTOMATIONS$PROACTIVATION_STEP_WORKSPACE,
              repositories: I18nKey.AUTOMATIONS$PROACTIVATION_STEP_REPOSITORIES,
              watch: I18nKey.AUTOMATIONS$PROACTIVATION_STEP_WATCH,
              autonomy: I18nKey.AUTOMATIONS$PROACTIVATION_STEP_AUTONOMY,
              schedule: I18nKey.AUTOMATIONS$PROACTIVATION_STEP_SCHEDULE,
              review: I18nKey.AUTOMATIONS$PROACTIVATION_STEP_REVIEW,
            }[step],
          )}
          {` (${stepIndex + 1}/${STEPS.length})`}
        </p>

        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {step === "workspace" && (
            <div className="rounded-lg bg-[var(--oh-surface-raised)] p-4 text-sm text-content">
              {activeWorkspace
                ? activeWorkspace.name
                : t(I18nKey.AUTOMATIONS$PROACTIVATION_NO_WORKSPACE)}
            </div>
          )}

          {step === "repositories" && (
            <div className="flex flex-col gap-3">
              {providers.length > 1 && (
                <GitProviderDropdown
                  providers={providers}
                  value={selectedProvider}
                  onChange={setSelectedProvider}
                />
              )}
              {selectedProvider && canListRepositories && (
                <GitRepoDropdown
                  provider={selectedProvider}
                  onChange={handleAddRepo}
                  placeholder={t(
                    I18nKey.AUTOMATIONS$PROACTIVATION_ADD_REPOSITORY,
                  )}
                />
              )}
              {!canListRepositories && (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <SettingsInput
                      testId="proactivation-manual-repo"
                      name="manualRepo"
                      type="text"
                      label={t(
                        I18nKey.AUTOMATIONS$PROACTIVATION_ADD_REPOSITORY,
                      )}
                      value={manualRepo}
                      onChange={setManualRepo}
                      placeholder={t(I18nKey.SETUP$REPOSITORY_PLACEHOLDER)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddManualRepo();
                        }
                      }}
                    />
                  </div>
                  <BrandButton
                    type="button"
                    variant="secondary"
                    testId="proactivation-manual-repo-add"
                    onClick={handleAddManualRepo}
                    isDisabled={manualRepo.trim().length === 0}
                  >
                    {t(I18nKey.AUTOMATIONS$PROACTIVATION_ADD_REPOSITORY)}
                  </BrandButton>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {selectedRepos.length === 0 && (
                  <p className="text-xs text-muted">
                    {t(I18nKey.AUTOMATIONS$PROACTIVATION_NO_REPOSITORIES)}
                  </p>
                )}
                {selectedRepos.map((repo) => (
                  <div
                    key={repoKey(repo)}
                    className="flex items-center justify-between rounded-lg bg-[var(--oh-surface-raised)] px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-content">
                        {repo.full_name}
                      </div>
                      {repo.main_branch && (
                        <div className="truncate text-xs text-muted">
                          {t(I18nKey.AUTOMATIONS$PROACTIVATION_DEFAULT_BRANCH, {
                            branch: repo.main_branch,
                          })}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRepo(repo)}
                      className="text-muted hover:text-foreground"
                      aria-label={t(I18nKey.AUTOMATIONS$CANCEL)}
                    >
                      <XMarkIcon className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "watch" && (
            <div className="flex flex-col gap-2">
              {WATCH_AREAS.map((area) => {
                const copy = WATCH_AREA_COPY_KEYS[area];
                const checked = watchAreas.has(area);
                return (
                  <label
                    key={area}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                      checked
                        ? "border-[var(--oh-primary,theme(colors.blue.500))] bg-[var(--oh-surface-raised)]"
                        : "border-[var(--oh-border)]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWatchArea(area)}
                      aria-label={t(copy.label)}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium text-content">
                        {t(copy.label)}
                      </div>
                      <div className="text-xs text-muted">
                        {t(copy.description)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {step === "autonomy" && (
            <div className="flex flex-col gap-2">
              {AUTONOMY_LEVELS.map((level) => (
                <label
                  key={level.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                    autonomyLevel === level.value
                      ? "border-[var(--oh-primary,theme(colors.blue.500))] bg-[var(--oh-surface-raised)]"
                      : "border-[var(--oh-border)]",
                  )}
                >
                  <input
                    type="radio"
                    name="autonomy-level"
                    checked={autonomyLevel === level.value}
                    onChange={() => setAutonomyLevel(level.value)}
                    aria-label={t(level.label)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-content">
                      {t(level.label)}
                    </div>
                    <div className="text-xs text-muted">
                      {t(level.description)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === "schedule" && (
            <SettingsDropdownInput
              testId="proactivation-frequency"
              name="frequency"
              label={t(I18nKey.AUTOMATIONS$FREQUENCY)}
              items={frequencyItems}
              selectedKey={frequency}
              onSelectionChange={(key) => {
                if (key) setFrequency(key as SchedulePresetKind);
              }}
            />
          )}

          {step === "review" && (
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$PROACTIVATION_REVIEW_WORKSPACE)}
                </span>
                <div className="text-content">
                  {activeWorkspace?.name ?? "—"}
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$PROACTIVATION_REVIEW_REPOSITORIES)}
                </span>
                <div className="text-content">
                  {selectedRepos.map((r) => r.full_name).join(", ")}
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$PROACTIVATION_REVIEW_WATCHING)}
                </span>
                <div className="text-content">
                  {WATCH_AREAS.filter((a) => watchAreas.has(a))
                    .map((a) => getWatchAreaLabel(a))
                    .join(", ")}
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$PROACTIVATION_REVIEW_MODE)}
                </span>
                <div className="text-content">
                  {t(
                    AUTONOMY_LEVELS.find((l) => l.value === autonomyLevel)!
                      .label,
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-muted">
                  {t(I18nKey.AUTOMATIONS$PROACTIVATION_REVIEW_SCHEDULE)}
                </span>
                <div className="text-content">
                  {frequencyItems.find((f) => f.key === frequency)?.label ??
                    frequency}
                </div>
              </div>
              {submitError && (
                <p className="text-xs text-red-400">{submitError}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-3">
          {stepIndex > 0 && (
            <BrandButton
              type="button"
              variant="secondary"
              onClick={goBack}
              isDisabled={isSubmitting}
            >
              {t(I18nKey.AUTOMATIONS$PROACTIVATION_BACK)}
            </BrandButton>
          )}
          {step !== "review" ? (
            <BrandButton
              type="button"
              variant="primary"
              onClick={goNext}
              isDisabled={!canGoNext}
            >
              {t(I18nKey.AUTOMATIONS$PROACTIVATION_NEXT)}
            </BrandButton>
          ) : (
            <BrandButton
              type="button"
              variant="primary"
              onClick={handleEnable}
              isDisabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting
                ? t(I18nKey.AUTOMATIONS$PROACTIVATION_ENABLING)
                : t(I18nKey.AUTOMATIONS$PROACTIVATION_ENABLE_SUBMIT)}
            </BrandButton>
          )}
        </div>
      </div>
    </div>
  );
}
