import React from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FaGithub } from "react-icons/fa6";
import { Typography } from "#/ui/typography";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useGithubConnection } from "#/hooks/query/use-github-connection";
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

export const handle = { hideTitle: true };

export function ConnectionsSettingsScreen() {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { data: connection, isLoading } = useGithubConnection();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isDisconnecting, setIsDisconnecting] = React.useState(false);
  const [showEnterpriseHost, setShowEnterpriseHost] = React.useState(false);
  const [enterpriseHost, setEnterpriseHost] = React.useState("");

  React.useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected === "github") {
      displaySuccessToast("GitHub connected.");
      queryClient.invalidateQueries({ queryKey: ["github-connection"] });
    } else if (error) {
      displayErrorToast(`GitHub connection failed: ${error}`);
    }
    if (connected || error) {
      const next = new URLSearchParams(searchParams);
      next.delete("connected");
      next.delete("error");
      setSearchParams(next, { replace: true });
    }
    // Only run once on mount to consume the OAuth redirect's query params.
  }, []);

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
        queryClient.invalidateQueries({ queryKey: ["github-connection"] });
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

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

      {isLoading ? (
        <LoadingSpinner size="small" />
      ) : (
        <div className="flex flex-col gap-4 rounded-md border border-[var(--oh-border)] p-4">
          <div className="flex items-center gap-3">
            <FaGithub size={24} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">
                {t(I18nKey.CONNECTIONS$GITHUB_LABEL)}
              </p>
              {connection ? (
                <p
                  data-testid="github-connection-status"
                  className="truncate text-xs text-tertiary-light"
                >
                  {t(I18nKey.CONNECTIONS$CONNECTED_AS, {
                    username: connection.githubUsername,
                  })}
                  {connection.enterpriseHost
                    ? ` (${connection.enterpriseHost})`
                    : ""}
                </p>
              ) : (
                <p className="text-xs text-tertiary-light">
                  {t(I18nKey.CONNECTIONS$NOT_CONNECTED)}
                </p>
              )}
            </div>
            {connection ? (
              <BrandButton
                testId="github-disconnect-button"
                type="button"
                variant="secondary"
                onClick={handleDisconnect}
                isDisabled={isDisconnecting}
              >
                {isDisconnecting
                  ? t(I18nKey.CONNECTIONS$DISCONNECTING)
                  : t(I18nKey.CONNECTIONS$DISCONNECT)}
              </BrandButton>
            ) : (
              <BrandButton
                testId="github-connect-button"
                type="button"
                variant="primary"
                onClick={handleConnect}
                isDisabled={isConnecting}
              >
                {isConnecting
                  ? t(I18nKey.CONNECTIONS$REDIRECTING)
                  : t(I18nKey.CONNECTIONS$CONNECT_GITHUB)}
              </BrandButton>
            )}
          </div>

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
                  placeholder={t(
                    I18nKey.CONNECTIONS$ENTERPRISE_HOST_PLACEHOLDER,
                  )}
                  value={enterpriseHost}
                  onChange={setEnterpriseHost}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default ConnectionsSettingsScreen;
