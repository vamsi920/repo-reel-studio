import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BackLink } from "#/components/features/automations/detail/back-link";
import { SearchInput } from "#/components/features/automations/search-input";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { PullRequestStatTiles } from "#/components/features/automations/pull-requests/pull-request-stat-tiles";
import { PullRequestsTable } from "#/components/features/automations/pull-requests/pull-requests-table";
import { useNeodevexPullRequests } from "#/hooks/query/use-neodevex-pull-requests";
import { extensionModuleEmptyStateClassName } from "#/utils/extension-module-card-classes";

type StatusFilterValue = "all" | "open" | "merged" | "closed";

const ALL_VALUE = "__all__";

export default function AutomationPullRequests() {
  const { t } = useTranslation("openhands");
  const {
    data: pullRequests,
    isLoading,
    isConnectionLoading,
    isConnected,
    isError,
    error,
    refetch,
    isFetching,
  } = useNeodevexPullRequests();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [repositoryFilter, setRepositoryFilter] = useState<string>(ALL_VALUE);
  const [automationFilter, setAutomationFilter] = useState<string>(ALL_VALUE);

  const all = pullRequests ?? [];

  const repositoryOptions = useMemo(
    () => Array.from(new Set(all.map((pr) => pr.repository))).sort(),
    [all],
  );
  const automationOptions = useMemo(
    () => Array.from(new Set(all.map((pr) => pr.automationLabel))).sort(),
    [all],
  );

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return all
      .filter((pr) => statusFilter === "all" || pr.state === statusFilter)
      .filter(
        (pr) =>
          repositoryFilter === ALL_VALUE || pr.repository === repositoryFilter,
      )
      .filter(
        (pr) =>
          automationFilter === ALL_VALUE ||
          pr.automationLabel === automationFilter,
      )
      .filter((pr) => !query || pr.title.toLowerCase().includes(query))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [all, searchQuery, statusFilter, repositoryFilter, automationFilter]);

  const statusItems = [
    { key: "all", label: t(I18nKey.AUTOMATIONS$PULL_REQUESTS$FILTER_ALL) },
    {
      key: "open",
      label: t(I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_OPEN),
    },
    {
      key: "merged",
      label: t(I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_MERGED),
    },
    {
      key: "closed",
      label: t(I18nKey.AUTOMATIONS$PULL_REQUESTS$STATUS_CLOSED),
    },
  ];
  const repositoryItems = [
    { key: ALL_VALUE, label: t(I18nKey.AUTOMATIONS$PULL_REQUESTS$FILTER_ALL) },
    ...repositoryOptions.map((repo) => ({ key: repo, label: repo })),
  ];
  const automationItems = [
    { key: ALL_VALUE, label: t(I18nKey.AUTOMATIONS$PULL_REQUESTS$FILTER_ALL) },
    ...automationOptions.map((name) => ({ key: name, label: name })),
  ];

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex flex-col gap-4">
          <BackLink />

          <div>
            <h1 className="text-xl font-semibold text-content">
              {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$TITLE)}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$SUBTITLE)}
            </p>
          </div>

          {isConnectionLoading ? (
            <div className={extensionModuleEmptyStateClassName}>
              <p className="text-sm text-white">
                {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$LOADING)}
              </p>
            </div>
          ) : !isConnected ? (
            <div className={extensionModuleEmptyStateClassName}>
              <p className="text-sm text-white">
                {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$NOT_CONNECTED)}
              </p>
              <p className="mt-1 text-xs text-tertiary-light">
                {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$NOT_CONNECTED_HINT)}
              </p>
            </div>
          ) : isError ? (
            <div className={extensionModuleEmptyStateClassName}>
              <p className="text-sm text-white">
                {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$ERROR)}
              </p>
              <p className="mt-1 text-xs text-tertiary-light">
                {error instanceof Error ? error.message : ""}
              </p>
              <div className="mt-4">
                <BrandButton
                  type="button"
                  variant="secondary"
                  onClick={() => refetch()}
                >
                  {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$RETRY)}
                </BrandButton>
              </div>
            </div>
          ) : isLoading ? (
            <div className={extensionModuleEmptyStateClassName}>
              <p className="text-sm text-white">
                {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$LOADING)}
              </p>
            </div>
          ) : all.length === 0 ? (
            <div className={extensionModuleEmptyStateClassName}>
              <p className="text-sm text-white">
                {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$EMPTY)}
              </p>
              <p className="mt-1 text-xs text-tertiary-light">
                {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$EMPTY_HINT)}
              </p>
            </div>
          ) : (
            <>
              <PullRequestStatTiles pullRequests={all} />

              <div className="flex flex-wrap items-stretch gap-2">
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  className="min-w-[200px]"
                />
                <div className="min-w-[140px]">
                  <SettingsDropdownInput
                    testId="pull-requests-status-filter"
                    name="status"
                    items={statusItems}
                    selectedKey={statusFilter}
                    onSelectionChange={(key) => {
                      if (key) setStatusFilter(key as StatusFilterValue);
                    }}
                  />
                </div>
                <div className="min-w-[180px]">
                  <SettingsDropdownInput
                    testId="pull-requests-repository-filter"
                    name="repository"
                    items={repositoryItems}
                    selectedKey={repositoryFilter}
                    onSelectionChange={(key) => {
                      if (key) setRepositoryFilter(String(key));
                    }}
                  />
                </div>
                <div className="min-w-[180px]">
                  <SettingsDropdownInput
                    testId="pull-requests-automation-filter"
                    name="automation"
                    items={automationItems}
                    selectedKey={automationFilter}
                    onSelectionChange={(key) => {
                      if (key) setAutomationFilter(String(key));
                    }}
                  />
                </div>
                <BrandButton
                  type="button"
                  variant="secondary"
                  onClick={() => refetch()}
                  isDisabled={isFetching}
                  aria-busy={isFetching}
                >
                  {isFetching
                    ? t(I18nKey.AUTOMATIONS$PULL_REQUESTS$REFRESHING)
                    : t(I18nKey.AUTOMATIONS$PULL_REQUESTS$REFRESH)}
                </BrandButton>
              </div>

              {visible.length === 0 ? (
                <div className={extensionModuleEmptyStateClassName}>
                  <p className="text-sm text-white">
                    {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$NO_MATCHES)}
                  </p>
                </div>
              ) : (
                <PullRequestsTable pullRequests={visible} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
