import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { useDeploymentCapabilities } from "#/hooks/query/use-manifest-capabilities";
import {
  CI_SOURCE,
  GITHUB_TRIGGER_EVENTS,
  type GitHubTriggerEvent,
} from "#/utils/automation-event-trigger";

const GITHUB_EVENT_LABELS: Record<GitHubTriggerEvent, I18nKey> = {
  issue_opened: I18nKey.AUTOMATIONS$GITHUB_EVENT_ISSUE_OPENED,
  issue_comment: I18nKey.AUTOMATIONS$GITHUB_EVENT_ISSUE_COMMENT,
  pr_opened: I18nKey.AUTOMATIONS$GITHUB_EVENT_PR_OPENED,
  push: I18nKey.AUTOMATIONS$GITHUB_EVENT_PUSH,
  ci_failed: I18nKey.AUTOMATIONS$GITHUB_EVENT_CI_FAILED,
};

/** What the one optional condition means for each event. */
const GITHUB_MATCH_LABELS: Record<GitHubTriggerEvent, I18nKey> = {
  issue_opened: I18nKey.AUTOMATIONS$GITHUB_MATCH_TITLE,
  issue_comment: I18nKey.AUTOMATIONS$GITHUB_MATCH_COMMENT,
  pr_opened: I18nKey.AUTOMATIONS$GITHUB_MATCH_BRANCH_PREFIX,
  push: I18nKey.AUTOMATIONS$GITHUB_MATCH_BRANCH,
  ci_failed: I18nKey.AUTOMATIONS$GITHUB_MATCH_BRANCH_PREFIX,
};

/** Example values, shown as placeholders; not user-facing copy. */
const GITHUB_MATCH_EXAMPLES: Record<GitHubTriggerEvent, string> = {
  issue_opened: "bug",
  issue_comment: "/fix",
  pr_opened: "release/",
  push: "main",
  ci_failed: "main",
};

interface GitHubTriggerFieldsProps {
  /** Prefix for data-testids, e.g. "create-automation" or "edit-automation". */
  testIdPrefix: string;
  event: GitHubTriggerEvent;
  match: string;
  onEventChange: (event: GitHubTriggerEvent) => void;
  onMatchChange: (match: string) => void;
}

/**
 * Picks the GitHub event that starts an automation and its one optional
 * condition, in plain language. Shared by the create form and the edit
 * dialog so a trigger can be changed the same way it was made. Warns when
 * this deployment cannot receive the event's source, because such an
 * automation would never run.
 */
export function GitHubTriggerFields({
  testIdPrefix,
  event,
  match,
  onEventChange,
  onMatchChange,
}: GitHubTriggerFieldsProps) {
  const { t } = useTranslation("openhands");
  const { data: capabilities } = useDeploymentCapabilities();
  const neededSource = event === "ci_failed" ? CI_SOURCE : "github";
  const receiverMissing =
    !!capabilities && !capabilities.eventSources.includes(neededSource);
  const eventItems = GITHUB_TRIGGER_EVENTS.map((key) => ({
    key,
    label: t(GITHUB_EVENT_LABELS[key]),
  }));

  return (
    <div className="flex flex-col gap-3" data-testid={`${testIdPrefix}-github`}>
      <SettingsDropdownInput
        testId={`${testIdPrefix}-github-event`}
        name="githubEvent"
        label={t(I18nKey.AUTOMATIONS$CREATE_GITHUB_EVENT_LABEL)}
        items={eventItems}
        selectedKey={event}
        onSelectionChange={(key) => {
          if (key) onEventChange(key as GitHubTriggerEvent);
        }}
      />
      <div className="flex flex-col gap-2.5">
        <SettingsInput
          testId={`${testIdPrefix}-github-match`}
          name="githubMatch"
          type="text"
          label={t(GITHUB_MATCH_LABELS[event])}
          value={match}
          onChange={onMatchChange}
          placeholder={GITHUB_MATCH_EXAMPLES[event]}
          showOptionalTag
        />
        <span className="text-xs text-muted">
          {t(I18nKey.AUTOMATIONS$GITHUB_MATCH_HELP)}
        </span>
      </div>
      {receiverMissing && (
        <p
          className="text-xs text-danger"
          data-testid={`${testIdPrefix}-github-receiver-missing`}
        >
          {t(I18nKey.AUTOMATIONS$CREATE_GITHUB_RECEIVER_MISSING)}
        </p>
      )}
    </div>
  );
}
