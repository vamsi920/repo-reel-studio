import React from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FaGithub, FaJira } from "react-icons/fa6";
import { Typography } from "#/ui/typography";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { ConnectionProviderCard } from "#/components/features/settings/connection-provider-card";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useGithubConnection } from "#/hooks/query/use-github-connection";
import { useJiraConnection } from "#/hooks/query/use-jira-connection";
import { useJiraIssues } from "#/hooks/query/use-jira-issues";
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";
import AutomationService from "#/api/automation-service/automation-service.api";
import { buildJiraTriggerPayload } from "#/manifests/jira-trigger-setup";
import { jiraTriggersRepository } from "#/lib/data-platform/repositories/jira-triggers-repository";

export const handle = { hideTitle: true };

function GithubConnectionCard() {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { data: connection, isLoading } = useGithubConnection();
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isDisconnecting, setIsDisconnecting] = React.useState(false);
  const [showEnterpriseHost, setShowEnterpriseHost] = React.useState(false);
  const [enterpriseHost, setEnterpriseHost] = React.useState("");

  const handleConnect = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        authorizeUrl: string;
      }>("github-oauth-start", {
        body: showEnterpriseHost && enterpriseHost ? { enterpriseHost } : {},
      });
      if (error || !data?.authorizeUrl) {
        displayErrorToast("Could not start GitHub connection.");
        setIsConnecting(false);
        return;
      }
      window.location.assign(data.authorizeUrl);
    } catch {
      displayErrorToast("Could not start GitHub connection.");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setIsDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("github-disconnect", {
        body: {},
      });
      if (error) {
        displayErrorToast("Could not disconnect GitHub.");
      } else {
        displaySuccessToast("GitHub disconnected.");
        await invalidateConnectionCaches(queryClient);
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) return <LoadingSpinner size="small" />;

  return (
    <ConnectionProviderCard
      icon={<FaGithub size={24} />}
      label={t(I18nKey.CONNECTIONS$GITHUB_LABEL)}
      isConnected={!!connection}
      statusText={
        connection
          ? `${t(I18nKey.CONNECTIONS$CONNECTED_AS, { username: connection.githubUsername })}${connection.enterpriseHost ? ` (${connection.enterpriseHost})` : ""}`
          : t(I18nKey.CONNECTIONS$NOT_CONNECTED)
      }
      isBusy={connection ? isDisconnecting : isConnecting}
      busyLabel={
        connection
          ? t(I18nKey.CONNECTIONS$DISCONNECTING)
          : t(I18nKey.CONNECTIONS$REDIRECTING)
      }
      actionLabel={
        connection
          ? t(I18nKey.CONNECTIONS$DISCONNECT)
          : t(I18nKey.CONNECTIONS$CONNECT_GITHUB)
      }
      onAction={connection ? handleDisconnect : handleConnect}
      testIdPrefix="github"
    >
      {!connection ? (
        <div className="flex flex-col gap-2 border-t border-[var(--oh-border)] pt-4">
          <SettingsSwitch
            testId="github-enterprise-toggle"
            onToggle={setShowEnterpriseHost}
            defaultIsToggled={showEnterpriseHost}
          >
            {t(I18nKey.CONNECTIONS$ENTERPRISE_SERVER_TOGGLE)}
          </SettingsSwitch>
          {showEnterpriseHost ? (
            <SettingsInput
              testId="github-enterprise-host-input"
              label={t(I18nKey.CONNECTIONS$ENTERPRISE_HOST_LABEL)}
              type="text"
              placeholder={t(I18nKey.CONNECTIONS$ENTERPRISE_HOST_PLACEHOLDER)}
              value={enterpriseHost}
              onChange={setEnterpriseHost}
            />
          ) : null}
        </div>
      ) : null}
    </ConnectionProviderCard>
  );
}

function JiraConnectionCard() {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { data: connection, isLoading } = useJiraConnection();
  const { data: issues } = useJiraIssues(!!connection);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isDisconnecting, setIsDisconnecting] = React.useState(false);

  const handleConnect = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        authorizeUrl: string;
      }>("jira-oauth-start", { body: {} });
      if (error || !data?.authorizeUrl) {
        displayErrorToast("Could not start Jira connection.");
        setIsConnecting(false);
        return;
      }
      window.location.assign(data.authorizeUrl);
    } catch {
      displayErrorToast("Could not start Jira connection.");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setIsDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("jira-disconnect", {
        body: {},
      });
      if (error) {
        displayErrorToast("Could not disconnect Jira.");
      } else {
        displaySuccessToast("Jira disconnected.");
        await invalidateConnectionCaches(queryClient);
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) return <LoadingSpinner size="small" />;

  return (
    <ConnectionProviderCard
      icon={<FaJira size={24} />}
      label={t(I18nKey.CONNECTIONS$JIRA_LABEL)}
      isConnected={!!connection}
      statusText={
        connection
          ? t(I18nKey.CONNECTIONS$CONNECTED_TO_SITE, {
              site: connection.siteName ?? connection.siteUrl,
            })
          : t(I18nKey.CONNECTIONS$NOT_CONNECTED)
      }
      isBusy={connection ? isDisconnecting : isConnecting}
      busyLabel={
        connection
          ? t(I18nKey.CONNECTIONS$DISCONNECTING)
          : t(I18nKey.CONNECTIONS$REDIRECTING)
      }
      actionLabel={
        connection
          ? t(I18nKey.CONNECTIONS$DISCONNECT)
          : t(I18nKey.CONNECTIONS$CONNECT_JIRA)
      }
      onAction={connection ? handleDisconnect : handleConnect}
      testIdPrefix="jira"
    >
      {connection ? (
        <div className="flex flex-col gap-2 border-t border-[var(--oh-border)] pt-4">
          <p className="text-xs font-medium text-tertiary-light">
            {t(I18nKey.CONNECTIONS$RECENT_ISSUES)}
          </p>
          {issues && issues.length > 0 ? (
            <ul className="flex flex-col gap-1" data-testid="jira-issue-list">
              {issues.map((issue) => (
                <li
                  key={issue.key}
                  className="flex items-center justify-between gap-2 text-xs text-white"
                >
                  <span className="truncate">
                    <span className="font-mono text-tertiary-light">
                      {issue.key}
                    </span>{" "}
                    {issue.summary}
                  </span>
                  {issue.status ? (
                    <span className="shrink-0 text-tertiary-light">
                      {issue.status}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-tertiary-light">
              {t(I18nKey.CONNECTIONS$NO_ISSUES)}
            </p>
          )}
          <JiraInstantTriggers cloudId={connection.cloudId} />
        </div>
      ) : null}
    </ConnectionProviderCard>
  );
}

const DEFAULT_READY_STATUS = "Ready for Development";

function JiraInstantTriggers({ cloudId }: { cloudId: string }) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { data: triggers } = useQuery({
    queryKey: ["jira-triggers"],
    queryFn: () => jiraTriggersRepository.listTriggers(),
    staleTime: 1000 * 30,
    meta: { disableToast: true },
  });

  const [projectKey, setProjectKey] = React.useState("");
  const [labelFilter, setLabelFilter] = React.useState("");
  const [readyStatus, setReadyStatus] = React.useState(DEFAULT_READY_STATUS);
  const [repository, setRepository] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const invalidateTriggers = () =>
    queryClient.invalidateQueries({ queryKey: ["jira-triggers"] });

  const handleAdd = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!projectKey.trim() || !repository.trim()) return;
    setIsSaving(true);
    try {
      const alreadyRegistered =
        await jiraTriggersRepository.hasWebhookRegistration();
      if (!alreadyRegistered) {
        const webhook = await AutomationService.createCustomWebhook({
          name: "Jira instant triggers",
          source: "jira",
          event_key_expr: "webhookEvent",
        });
        const { error: registerError } = await supabase.functions.invoke(
          "jira-webhook-register",
          {
            body: {
              orgId: webhook.org_id,
              webhookId: webhook.id,
              webhookSecret: webhook.webhook_secret,
              signatureHeader: webhook.signature_header,
            },
          },
        );
        if (registerError) {
          displayErrorToast(t(I18nKey.CONNECTIONS$TRIGGER_CREATE_FAILED));
          return;
        }
      }

      const values = {
        projectKey: projectKey.trim(),
        labelFilter: labelFilter.trim() || undefined,
        readyStatus: readyStatus.trim() || DEFAULT_READY_STATUS,
        repository: repository.trim(),
        branch: branch.trim() || undefined,
      };
      const payload = buildJiraTriggerPayload(values, cloudId);
      const created = await AutomationService.createAutomationDraft(payload);
      const automationId = created.id as string | undefined;
      if (!automationId) {
        displayErrorToast(t(I18nKey.CONNECTIONS$TRIGGER_CREATE_FAILED));
        return;
      }

      await jiraTriggersRepository.createTrigger({ ...values, automationId });
      await invalidateTriggers();
      setProjectKey("");
      setLabelFilter("");
      setRepository("");
      setBranch("");
      displaySuccessToast(t(I18nKey.CONNECTIONS$TRIGGER_CREATED));
    } catch {
      displayErrorToast(t(I18nKey.CONNECTIONS$TRIGGER_CREATE_FAILED));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await jiraTriggersRepository.setEnabled(id, enabled);
    await invalidateTriggers();
  };

  const handleDelete = async (id: string) => {
    await jiraTriggersRepository.deleteTrigger(id);
    await invalidateTriggers();
  };

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--oh-border)] pt-4">
      <div>
        <p className="text-xs font-medium text-white">
          {t(I18nKey.CONNECTIONS$JIRA_TRIGGERS_TITLE)}
        </p>
        <p className="text-xs text-tertiary-light">
          {t(I18nKey.CONNECTIONS$JIRA_TRIGGERS_DESCRIPTION)}
        </p>
      </div>

      {triggers && triggers.length > 0 ? (
        <ul className="flex flex-col gap-2" data-testid="jira-trigger-list">
          {triggers.map((trigger) => (
            <li
              key={trigger.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--oh-border)] px-2 py-1.5 text-xs text-white"
            >
              <span className="truncate">
                <span className="font-mono">{trigger.projectKey}</span>
                {trigger.labelFilter ? ` · ${trigger.labelFilter}` : ""} →{" "}
                {trigger.repository}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  data-testid={`jira-trigger-toggle-${trigger.id}`}
                  onClick={() => handleToggle(trigger.id, !trigger.enabled)}
                  className="text-tertiary-light hover:text-white"
                >
                  {trigger.enabled
                    ? t(I18nKey.CONNECTIONS$TRIGGER_ENABLED)
                    : t(I18nKey.CONNECTIONS$TRIGGER_DISABLED)}
                </button>
                <button
                  type="button"
                  data-testid={`jira-trigger-delete-${trigger.id}`}
                  onClick={() => handleDelete(trigger.id)}
                  className="text-red-500 hover:text-red-400"
                >
                  {t(I18nKey.CONNECTIONS$TRIGGER_DELETE)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-tertiary-light">
          {t(I18nKey.CONNECTIONS$TRIGGER_EMPTY)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <SettingsInput
          testId="jira-trigger-project-key"
          label={t(I18nKey.CONNECTIONS$TRIGGER_PROJECT_KEY_LABEL)}
          type="text"
          value={projectKey}
          onChange={setProjectKey}
        />
        <SettingsInput
          testId="jira-trigger-label"
          label={t(I18nKey.CONNECTIONS$TRIGGER_LABEL_LABEL)}
          type="text"
          value={labelFilter}
          onChange={setLabelFilter}
        />
        <SettingsInput
          testId="jira-trigger-ready-status"
          label={t(I18nKey.CONNECTIONS$TRIGGER_READY_STATUS_LABEL)}
          type="text"
          value={readyStatus}
          onChange={setReadyStatus}
        />
        <SettingsInput
          testId="jira-trigger-repository"
          label={t(I18nKey.CONNECTIONS$TRIGGER_REPOSITORY_LABEL)}
          type="text"
          value={repository}
          onChange={setRepository}
        />
        <SettingsInput
          testId="jira-trigger-branch"
          label={t(I18nKey.CONNECTIONS$TRIGGER_BRANCH_LABEL)}
          type="text"
          value={branch}
          onChange={setBranch}
        />
      </div>
      <BrandButton
        testId="jira-trigger-add-button"
        type="button"
        variant="secondary"
        onClick={handleAdd}
        isDisabled={isSaving || !projectKey.trim() || !repository.trim()}
      >
        {isSaving
          ? t(I18nKey.CONNECTIONS$TRIGGER_ADDING)
          : t(I18nKey.CONNECTIONS$TRIGGER_ADD_BUTTON)}
      </BrandButton>
    </div>
  );
}

export function ConnectionsSettingsScreen() {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  React.useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected === "github") {
      displaySuccessToast("GitHub connected.");
      void invalidateConnectionCaches(queryClient);
    } else if (connected === "jira") {
      displaySuccessToast("Jira connected.");
      void invalidateConnectionCaches(queryClient);
    } else if (error) {
      displayErrorToast(`Connection failed: ${error}`);
    }
    if (connected || error) {
      const next = new URLSearchParams(searchParams);
      next.delete("connected");
      next.delete("error");
      setSearchParams(next, { replace: true });
    }
    // Only run once on mount to consume the OAuth redirect's query params.
  }, []);

  return (
    <div
      data-testid="connections-settings-screen"
      className="flex flex-col gap-6"
    >
      <div className="space-y-1">
        <Typography.H2>{t(I18nKey.SETTINGS$NAV_CONNECTIONS)}</Typography.H2>
        <p
          data-testid="settings-page-subtitle"
          className="text-sm leading-5 text-tertiary-light"
        >
          {t(I18nKey.CONNECTIONS$PAGE_DESCRIPTION)}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <GithubConnectionCard />
        <JiraConnectionCard />
      </div>
    </div>
  );
}

export default ConnectionsSettingsScreen;
