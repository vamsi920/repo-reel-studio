import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { I18nKey } from "#/i18n/declaration";
import AutomationService from "#/api/automation-service/automation-service.api";
import { AUTOMATIONS_QUERY_KEY } from "#/hooks/query/use-automations";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useDeploymentCapabilities } from "#/hooks/query/use-manifest-capabilities";
import { useNavigation } from "#/context/navigation-context";
import { automationDetailPath } from "#/manifests/automation-interface";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  buildCronSchedule,
  formatTimeOfDay,
  isValidCronExpression,
  parseTimeOfDay,
  type SchedulePresetKind,
} from "#/utils/automation-schedule";
import {
  buildGitHubEventTrigger,
  repoSlug,
  type GitHubTriggerEvent,
} from "#/utils/automation-event-trigger";
import {
  validateAutomationTimeout,
  AUTOMATION_TIMEOUT_DEFAULT_SECONDS,
} from "#/utils/automation-timeout";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import type { SetupRequestBody } from "#/manifests/types";
import {
  formControlMultilineFieldClassName,
  formControlSettingsFieldClassName,
} from "#/utils/form-control-classes";
import { cn } from "#/utils/utils";
import { checkGithubRepository } from "#/api/git-service/github-credential-health";
import { useGithubRepositorySuggestions } from "#/hooks/query/use-github-repository-suggestions";
import {
  buildWebhookTrigger,
  rememberWebhookSecret,
  WEBHOOK_EVENT_KEY_EXPR,
  webhookSourceFor,
} from "#/utils/automation-webhook";
import { GitHubTriggerFields } from "./github-trigger-fields";
import { ModelRecommendationHint } from "./model-recommendation-hint";

interface CreateAutomationFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

/** Sentinel for "use the active profile", mirroring EditAutomationModal. */
const ACTIVE_PROFILE_KEY = "__active__";

type RunWhen = "schedule" | "github" | "webhook";

const REPOSITORY_SUGGESTIONS_ID = "create-automation-repository-suggestions";

const RUN_WHEN_OPTIONS: readonly (readonly [RunWhen, I18nKey])[] = [
  ["schedule", I18nKey.AUTOMATIONS$CREATE_RUN_WHEN_SCHEDULE],
  ["github", I18nKey.AUTOMATIONS$CREATE_RUN_WHEN_GITHUB],
  ["webhook", I18nKey.AUTOMATIONS$CREATE_RUN_WHEN_WEBHOOK],
];
type Frequency = SchedulePresetKind | "hourly" | "custom";

const WEEKDAY_KEYS: I18nKey[] = [
  I18nKey.AUTOMATIONS$WEEKDAY_SUN,
  I18nKey.AUTOMATIONS$WEEKDAY_MON,
  I18nKey.AUTOMATIONS$WEEKDAY_TUE,
  I18nKey.AUTOMATIONS$WEEKDAY_WED,
  I18nKey.AUTOMATIONS$WEEKDAY_THU,
  I18nKey.AUTOMATIONS$WEEKDAY_FRI,
  I18nKey.AUTOMATIONS$WEEKDAY_SAT,
];

/**
 * Creates a real automation from a single form.
 *
 * This posts once to the service's prompt-preset endpoint, which returns a
 * created, scheduled record — the same path the manifest setup dialog uses.
 * It deliberately does not go through `createAutomation`, whose two-step
 * create-then-PATCH dance exists only so an *imported* automation can be born
 * disabled behind an inert placeholder trigger.
 *
 * The service's create model is `extra="forbid"`, so only the keys it declares
 * may be sent: name, prompt, model, trigger, timeout, keep_alive, repos,
 * template, enabled. Anything else is a hard 422.
 */
export function CreateAutomationForm({
  onCreated,
  onCancel,
}: CreateAutomationFormProps) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { navigate } = useNavigation();
  const { data: profilesData, isLoading: isLoadingProfiles } = useLlmProfiles();
  const { data: capabilities } = useDeploymentCapabilities();
  const profiles = profilesData?.profiles ?? [];
  const repositorySuggestions = useGithubRepositorySuggestions();

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [repository, setRepository] = useState("");
  const [runWhen, setRunWhen] = useState<RunWhen>("schedule");
  const [githubEvent, setGithubEvent] =
    useState<GitHubTriggerEvent>("issue_opened");
  const [githubMatch, setGithubMatch] = useState("");
  const [webhookMatch, setWebhookMatch] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [customCron, setCustomCron] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState(formatTimeOfDay(9, 0));
  const [model, setModel] = useState("");
  const [timeout, setTimeoutValue] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timeoutMax = capabilities?.maxAutomationTimeoutSeconds;

  const frequencyItems = [
    { key: "hourly", label: t(I18nKey.AUTOMATIONS$FREQUENCY_HOURLY) },
    { key: "daily", label: t(I18nKey.AUTOMATIONS$FREQUENCY_DAILY) },
    { key: "weekdays", label: t(I18nKey.AUTOMATIONS$FREQUENCY_WEEKDAYS) },
    { key: "weekly", label: t(I18nKey.AUTOMATIONS$FREQUENCY_WEEKLY) },
    { key: "custom", label: t(I18nKey.AUTOMATIONS$CREATE_CRON_LABEL) },
  ];
  const weekdayItems = WEEKDAY_KEYS.map((key, index) => ({
    key: String(index),
    label: t(key),
  }));
  const modelItems = [
    { key: ACTIVE_PROFILE_KEY, label: t(I18nKey.COMMON$ACTIVE_PROFILE) },
    ...profiles.map((p) => ({ key: p.name, label: p.name })),
  ];

  const handleNameChange = (value: string) => {
    setName(value);
    if (nameError && value.trim()) setNameError(null);
  };

  const handlePromptChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const { value } = event.target;
    setPrompt(value);
    if (promptError && value.trim()) setPromptError(null);
  };

  function scheduleFor(): string {
    if (frequency === "custom") return customCron.trim().replace(/\s+/g, " ");
    const parsedTime = parseTimeOfDay(timeOfDay) ?? { hour: 9, minute: 0 };
    if (frequency === "hourly") return `${parsedTime.minute} * * * *`;
    return buildCronSchedule({
      kind: frequency,
      hour: parsedTime.hour,
      minute: parsedTime.minute,
      weekday: frequency === "weekly" ? weekday : undefined,
    });
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    const trimmedRepository = repository.trim();

    setNameError(
      trimmedName ? null : t(I18nKey.AUTOMATIONS$CREATE_NAME_REQUIRED),
    );
    setPromptError(
      trimmedPrompt
        ? null
        : t(I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_REQUIRED),
    );
    const slug = repoSlug(trimmedRepository);
    const repoInvalid = runWhen === "github" && !slug;
    setRepositoryError(
      repoInvalid
        ? t(I18nKey.AUTOMATIONS$CREATE_REPOSITORY_REQUIRED_FOR_GITHUB)
        : null,
    );
    const cronInvalid =
      runWhen === "schedule" &&
      frequency === "custom" &&
      !isValidCronExpression(customCron);
    setCronError(
      cronInvalid ? t(I18nKey.AUTOMATIONS$CREATE_CRON_INVALID) : null,
    );
    // An empty or partial time used to fall back to 09:00 without a word.
    const timeInvalid =
      runWhen === "schedule" &&
      frequency !== "custom" &&
      parseTimeOfDay(timeOfDay) === null;
    setTimeError(
      timeInvalid ? t(I18nKey.AUTOMATIONS$CREATE_TIME_INVALID) : null,
    );
    if (
      !trimmedName ||
      !trimmedPrompt ||
      repoInvalid ||
      cronInvalid ||
      timeInvalid
    )
      return;

    const timeoutResult = validateAutomationTimeout(timeout, timeoutMax);
    if ("errorKey" in timeoutResult) {
      setTimeoutError(t(timeoutResult.errorKey, { max: timeoutMax }));
      return;
    }
    setTimeoutError(null);

    setIsSubmitting(true);
    // A typo'd or inaccessible repository used to save fine and fail on its
    // first run. Only a definite "not found" blocks; unknown never does.
    if (slug && (await checkGithubRepository(slug)) === "missing") {
      setIsSubmitting(false);
      setRepositoryError(
        t(I18nKey.AUTOMATIONS$CREATE_REPOSITORY_NOT_FOUND, { repo: slug }),
      );
      return;
    }

    // A webhook automation gets its own webhook source, so its URL (and a
    // test event) reaches this automation and no other.
    let webhook: { source: string; secret: string | null } | null = null;
    if (runWhen === "webhook") {
      try {
        const source = webhookSourceFor(
          trimmedName,
          Math.random().toString(36).slice(2),
        );
        const created = await AutomationService.createCustomWebhook({
          name: trimmedName,
          source,
          event_key_expr: WEBHOOK_EVENT_KEY_EXPR,
        });
        webhook = { source, secret: created.webhook_secret };
      } catch (error) {
        setIsSubmitting(false);
        displayErrorToast(
          getApiErrorMessage(error, t(I18nKey.AUTOMATIONS$CREATE_ERROR)),
        );
        return;
      }
    }

    let trigger: SetupRequestBody["trigger"];
    if (webhook) trigger = buildWebhookTrigger(webhook.source, webhookMatch);
    else if (runWhen === "github" && slug)
      trigger = buildGitHubEventTrigger(githubEvent, slug, githubMatch);
    else trigger = { type: "cron", schedule: scheduleFor(), timezone };

    const body: SetupRequestBody = {
      name: trimmedName,
      prompt: trimmedPrompt,
      trigger,
      enabled,
      ...(model.trim() ? { model: model.trim() } : {}),
      ...(timeoutResult.value != null ? { timeout: timeoutResult.value } : {}),
      // A short owner/repo needs its provider named; a full URL carries it.
      ...(trimmedRepository
        ? {
            repos: [
              {
                url: trimmedRepository,
                ...(trimmedRepository.includes("://") ||
                trimmedRepository.startsWith("git@")
                  ? {}
                  : { provider: "github" }),
              },
            ],
          }
        : {}),
    };

    try {
      const created = await AutomationService.createAutomationDraft(body);
      if (webhook?.secret)
        rememberWebhookSecret(webhook.source, webhook.secret);
      await queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      displaySuccessToast(t(I18nKey.AUTOMATIONS$CREATE_SUCCESS));
      onCreated();
      const createdId = typeof created.id === "string" ? created.id : null;
      if (createdId) navigate?.(automationDetailPath(createdId));
    } catch (error) {
      if (webhook) {
        // Do not leave an orphaned webhook behind a failed create.
        const orphan = (
          await AutomationService.listCustomWebhooks().catch(() => [])
        ).find((hook) => hook.source === webhook?.source);
        if (orphan)
          await AutomationService.deleteCustomWebhook(orphan.id).catch(
            () => {},
          );
      }
      displayErrorToast(
        getApiErrorMessage(error, t(I18nKey.AUTOMATIONS$CREATE_ERROR)),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-label={t(I18nKey.AUTOMATIONS$CREATE_TITLE)}
      data-testid="create-automation-form"
    >
      <p className="text-sm text-muted">
        {t(I18nKey.AUTOMATIONS$CREATE_SUBTITLE)}
      </p>

      <SettingsInput
        testId="create-automation-name"
        name="name"
        type="text"
        label={t(I18nKey.AUTOMATIONS$CREATE_NAME_LABEL)}
        value={name}
        onChange={handleNameChange}
        placeholder={t(I18nKey.AUTOMATIONS$CREATE_NAME_PLACEHOLDER)}
        error={nameError ?? undefined}
        showRequiredTag
      />

      <label className="flex w-full min-w-0 flex-col gap-2.5">
        <span className="text-sm">
          {t(I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_LABEL)}
        </span>
        <textarea
          data-testid="create-automation-prompt"
          name="prompt"
          value={prompt}
          onChange={handlePromptChange}
          rows={6}
          placeholder={t(I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_PLACEHOLDER)}
          className={cn(
            formControlMultilineFieldClassName,
            "placeholder:italic",
          )}
        />
        {promptError ? (
          <span className="text-xs text-danger">{promptError}</span>
        ) : (
          <span className="text-xs text-muted">
            {t(I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_HELP)}
          </span>
        )}
      </label>

      <div className="flex flex-col gap-2.5">
        <SettingsInput
          testId="create-automation-repository"
          list={REPOSITORY_SUGGESTIONS_ID}
          name="repository"
          type="text"
          label={t(I18nKey.AUTOMATIONS$CREATE_REPOSITORY_LABEL)}
          value={repository}
          onChange={setRepository}
          placeholder={t(I18nKey.SETUP$REPOSITORY_PLACEHOLDER)}
          error={repositoryError ?? undefined}
          showOptionalTag={runWhen === "schedule"}
          showRequiredTag={runWhen === "github"}
        />
        <datalist id={REPOSITORY_SUGGESTIONS_ID}>
          {repositorySuggestions.map((repo) => (
            <option key={repo} value={repo} />
          ))}
        </datalist>
        {!repositoryError && (
          <span className="text-xs text-muted">
            {t(I18nKey.AUTOMATIONS$CREATE_REPOSITORY_HELP)}
          </span>
        )}
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-sm">
          {t(I18nKey.AUTOMATIONS$CREATE_RUN_WHEN_LABEL)}
        </legend>
        <div
          role="radiogroup"
          className="flex flex-wrap gap-2"
          data-testid="create-automation-run-when"
        >
          {RUN_WHEN_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={runWhen === value}
              data-testid={`create-automation-run-when-${value}`}
              onClick={() => {
                setRunWhen(value);
                setRepositoryError(null);
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                runWhen === value
                  ? "border-[var(--oh-accent)] bg-[var(--oh-accent)]/10 text-content"
                  : "border-[var(--oh-border)] text-muted hover:text-content",
              )}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </fieldset>

      {runWhen === "github" && (
        <GitHubTriggerFields
          testIdPrefix="create-automation"
          event={githubEvent}
          match={githubMatch}
          onEventChange={setGithubEvent}
          onMatchChange={setGithubMatch}
        />
      )}

      {runWhen === "webhook" && (
        <div className="flex flex-col gap-1.5">
          <SettingsInput
            testId="create-automation-webhook-match"
            name="webhookMatch"
            type="text"
            label={t(I18nKey.AUTOMATIONS$CREATE_WEBHOOK_MATCH_LABEL)}
            value={webhookMatch}
            onChange={setWebhookMatch}
            showOptionalTag
            // eslint-disable-next-line i18next/no-literal-string
            placeholder="deploy.failed"
          />
          <p className="text-xs text-muted">
            {t(I18nKey.AUTOMATIONS$CREATE_WEBHOOK_MATCH_HINT)}
          </p>
        </div>
      )}

      {runWhen === "schedule" && (
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[180px] flex-1">
            <SettingsDropdownInput
              testId="create-automation-frequency"
              name="frequency"
              label={t(I18nKey.AUTOMATIONS$CREATE_SCHEDULE_LABEL)}
              items={frequencyItems}
              selectedKey={frequency}
              onSelectionChange={(key) => {
                if (key) setFrequency(key as Frequency);
              }}
            />
          </div>
          {frequency === "weekly" && (
            <div className="min-w-[150px] flex-1">
              <SettingsDropdownInput
                testId="create-automation-weekday"
                name="weekday"
                label={t(I18nKey.AUTOMATIONS$WEEKDAY)}
                items={weekdayItems}
                selectedKey={String(weekday)}
                onSelectionChange={(key) => {
                  if (key !== null) setWeekday(Number(key));
                }}
              />
            </div>
          )}
          {frequency === "custom" ? (
            <div className="flex min-w-[220px] flex-1 flex-col gap-2.5">
              <SettingsInput
                testId="create-automation-cron"
                name="cron"
                type="text"
                label={t(I18nKey.AUTOMATIONS$CREATE_CRON_LABEL)}
                value={customCron}
                onChange={(value) => {
                  setCustomCron(value);
                  if (cronError && isValidCronExpression(value))
                    setCronError(null);
                }}
                // eslint-disable-next-line i18next/no-literal-string
                placeholder="0 9 * * 1-5"
                error={cronError ?? undefined}
              />
              <span className="text-xs text-muted">
                {t(I18nKey.AUTOMATIONS$CREATE_TIMEZONE_NOTE)}: {timezone}
              </span>
            </div>
          ) : (
            <label className="flex min-w-[130px] flex-1 flex-col gap-2.5">
              <span className="text-sm">
                {t(I18nKey.AUTOMATIONS$CREATE_TIME_LABEL)}
              </span>
              <input
                data-testid="create-automation-time"
                name="timeOfDay"
                type="time"
                value={timeOfDay}
                onChange={(e) => {
                  setTimeOfDay(e.target.value);
                  if (timeError && parseTimeOfDay(e.target.value))
                    setTimeError(null);
                }}
                aria-invalid={!!timeError}
                className={cn(
                  formControlSettingsFieldClassName,
                  timeError && "border-red-500",
                )}
              />
              {timeError && (
                <span role="alert" className="text-xs text-red-400">
                  {timeError}
                </span>
              )}
              <span className="text-xs text-muted">
                {frequency === "hourly"
                  ? t(I18nKey.AUTOMATIONS$CREATE_HOURLY_NOTE)
                  : `${t(I18nKey.AUTOMATIONS$CREATE_TIMEZONE_NOTE)}: ${timezone}`}
              </span>
            </label>
          )}
        </div>
      )}

      {(isLoadingProfiles || profiles.length > 0) && (
        <SettingsDropdownInput
          testId="create-automation-model"
          name="model"
          label={t(I18nKey.AUTOMATIONS$CREATE_MODEL_LABEL)}
          items={modelItems}
          selectedKey={model || ACTIVE_PROFILE_KEY}
          isLoading={isLoadingProfiles}
          placeholder={t(I18nKey.COMMON$ACTIVE_PROFILE)}
          onSelectionChange={(key) =>
            setModel(key && key !== ACTIVE_PROFILE_KEY ? String(key) : "")
          }
        />
      )}
      <ModelRecommendationHint
        profiles={profiles}
        active={profilesData?.active_profile ?? null}
        selected={model}
        prompt={prompt}
        onUse={setModel}
        testIdPrefix="create-automation"
      />

      <SettingsInput
        testId="create-automation-timeout"
        name="timeout"
        type="number"
        label={t(I18nKey.AUTOMATIONS$CREATE_TIMEOUT_LABEL)}
        value={timeout}
        onChange={setTimeoutValue}
        error={timeoutError ?? undefined}
        showOptionalTag
        min={1}
        max={timeoutMax}
        step={1}
        placeholder={String(AUTOMATION_TIMEOUT_DEFAULT_SECONDS)}
      />

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          data-testid="create-automation-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          aria-label={t(I18nKey.AUTOMATIONS$CREATE_ENABLED_LABEL)}
          className="mt-1"
        />
        <span className="flex flex-col">
          <span className="text-sm text-content">
            {t(I18nKey.AUTOMATIONS$CREATE_ENABLED_LABEL)}
          </span>
          <span className="text-xs text-muted">
            {t(I18nKey.AUTOMATIONS$CREATE_ENABLED_HELP)}
          </span>
        </span>
      </label>

      <div className="mt-2 flex justify-end gap-3">
        <BrandButton
          testId="create-automation-cancel"
          type="button"
          variant="secondary"
          onClick={onCancel}
          isDisabled={isSubmitting}
        >
          {t(I18nKey.AUTOMATIONS$CANCEL)}
        </BrandButton>
        <BrandButton
          testId="create-automation-submit"
          type="submit"
          variant="primary"
          isDisabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting
            ? t(I18nKey.AUTOMATIONS$CREATE_SUBMITTING)
            : t(I18nKey.AUTOMATIONS$CREATE_SUBMIT)}
        </BrandButton>
      </div>
    </form>
  );
}
