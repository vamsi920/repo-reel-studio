import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import CogIcon from "#/icons/cog.svg?react";
import GitBranchIcon from "#/icons/git-branch.svg?react";
import CheckCircleIcon from "#/icons/check-circle.svg?react";
import CalendarIcon from "#/icons/calendar.svg?react";
import SparkleIcon from "#/icons/sparkle.svg?react";
import { Zap } from "lucide-react";
import BellIcon from "#/icons/bell.svg?react";
import CodeTagIcon from "#/icons/code-tag.svg?react";
import LinkExternalIcon from "#/icons/link-external.svg?react";
import { formatEventOn } from "#/utils/automation-schedule";
import { isUnsupportedEventTrigger } from "#/utils/automation-trigger";
import { useSupportedEventSources } from "#/hooks/query/use-supported-event-sources";
import { SectionCard } from "./section-card";
import { ConfigField } from "./config-field";
import { BranchBadge } from "./branch-badge";
import { WebhookTriggerPanel } from "./webhook-trigger-panel";
import { isCustomWebhookSource } from "#/utils/automation-webhook";

interface ConfigurationSectionProps {
  automation: Automation;
}

const FILTER_TRUNCATE_LENGTH = 60;

function FilterExpression({ filter }: { filter: string }) {
  const { t } = useTranslation("openhands");
  const [expanded, setExpanded] = useState(false);
  const isLong = filter.length > FILTER_TRUNCATE_LENGTH;

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono break-all">
        {isLong && !expanded
          ? `${filter.slice(0, FILTER_TRUNCATE_LENGTH)}…`
          : filter}
      </span>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="text-xs text-muted hover:text-content self-start"
        >
          {expanded
            ? t(I18nKey.SETTINGS$SKILLS_SHOW_LESS)
            : t(I18nKey.SETTINGS$SKILLS_SHOW_MORE)}
        </button>
      )}
    </div>
  );
}

export function ConfigurationSection({
  automation,
}: ConfigurationSectionProps) {
  const supportedSources = useSupportedEventSources();
  const { t } = useTranslation("openhands");
  const isEvent = automation.trigger.type === "event";
  const isUnsupported = isUnsupportedEventTrigger(
    automation.trigger,
    supportedSources,
  );

  // The app writes the zone onto the trigger; older records carry it on the
  // automation. Without it the schedule read as if it were in local time.
  const timezone = automation.timezone ?? automation.trigger.timezone;
  const schedule =
    automation.trigger.schedule_human ?? automation.trigger.schedule ?? "";
  const scheduleDisplay =
    schedule && timezone ? `${schedule} (${timezone})` : schedule;

  const isWebhook = isEvent && isCustomWebhookSource(automation.trigger.source);
  let triggerDisplay = t(I18nKey.AUTOMATIONS$DETAIL$TRIGGER_SCHEDULE);
  if (isWebhook) triggerDisplay = t(I18nKey.AUTOMATIONS$DETAIL$TRIGGER_WEBHOOK);
  else if (isEvent)
    triggerDisplay = t(I18nKey.AUTOMATIONS$DETAIL$TRIGGER_EVENT);

  return (
    <SectionCard
      icon={<CogIcon className="size-4" />}
      title={t(I18nKey.AUTOMATIONS$DETAIL$CONFIGURATION)}
    >
      {isUnsupported && (
        <div
          role="alert"
          data-testid="unsupported-trigger-warning"
          className="mb-4 rounded-md border border-[var(--oh-warning)]/40 bg-[var(--oh-warning)]/10 px-3 py-2 text-sm text-[var(--oh-warning)]"
        >
          {t(I18nKey.AUTOMATIONS$UNSUPPORTED_TRIGGER_WARNING)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        {automation.repository && (
          <ConfigField
            icon={<GitBranchIcon className="size-3.5" />}
            label={t(I18nKey.AUTOMATIONS$DETAIL$REPOSITORIES)}
          >
            <span className="flex items-center gap-1">
              {automation.repository}
              {automation.branch && <BranchBadge branch={automation.branch} />}
            </span>
          </ConfigField>
        )}

        <ConfigField
          icon={<CheckCircleIcon className="size-3.5" />}
          label={t(I18nKey.AUTOMATIONS$DETAIL$TRIGGER)}
        >
          {triggerDisplay}
        </ConfigField>

        {!isEvent && (
          <ConfigField
            icon={<CalendarIcon className="size-3.5" />}
            label={t(I18nKey.AUTOMATIONS$DETAIL$SCHEDULE)}
          >
            {scheduleDisplay}
          </ConfigField>
        )}

        {isEvent && automation.trigger.source && (
          <ConfigField
            icon={<Zap className="size-3.5" aria-hidden="true" />}
            label={t(I18nKey.AUTOMATIONS$DETAIL$EVENT_SOURCE)}
          >
            {automation.trigger.source}
          </ConfigField>
        )}

        {isEvent && automation.trigger.on && (
          <ConfigField
            icon={<LinkExternalIcon className="size-3.5" />}
            label={t(I18nKey.AUTOMATIONS$DETAIL$EVENT_TYPE)}
          >
            {automation.trigger.on === "*"
              ? t(I18nKey.AUTOMATIONS$DETAIL$ANY_EVENT)
              : formatEventOn(automation.trigger.on)}
          </ConfigField>
        )}

        {isEvent && automation.trigger.filter && (
          <ConfigField
            icon={<CodeTagIcon className="size-3.5" />}
            label={t(I18nKey.AUTOMATIONS$DETAIL$EVENT_FILTER)}
          >
            <FilterExpression filter={automation.trigger.filter} />
          </ConfigField>
        )}

        <ConfigField
          icon={<SparkleIcon className="size-3.5" />}
          label={t(I18nKey.AUTOMATIONS$DETAIL$MODEL)}
        >
          {automation.model ?? t(I18nKey.COMMON$ACTIVE_PROFILE)}
        </ConfigField>

        {automation.notification && (
          <ConfigField
            icon={<BellIcon className="size-3.5" />}
            label={t(I18nKey.AUTOMATIONS$DETAIL$NOTIFICATION)}
          >
            {automation.notification}
          </ConfigField>
        )}
      </div>
      {isWebhook && (
        <WebhookTriggerPanel
          automationId={automation.id}
          source={automation.trigger.source!}
        />
      )}
    </SectionCard>
  );
}
