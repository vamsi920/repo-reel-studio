import React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { CAPABILITIES } from "#/lib/environment/types/capability";
import type {
  Capability,
  ConnectorManifest,
} from "#/lib/environment/types/capability";
import {
  CONNECTOR_MANIFESTS,
  filterByResidency,
  filterForAirGap,
  secretFieldNames,
} from "#/lib/environment/registry";
import { CAPABILITY_LABEL_KEY } from "#/lib/environment/display";
import { useConnections } from "#/hooks/query/use-connections";
import { useEnvironmentProfile } from "#/hooks/query/use-environment-profile";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import {
  EnvironmentService,
  EnvironmentServiceError,
} from "#/api/environment-service/environment-service.api";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { ConnectorCard } from "#/components/features/environment/connections/connector-card";
import { ConnectionForm } from "#/components/features/environment/connections/connection-form";
import { ProbeResultPanel } from "#/components/features/environment/shared/probe-result-panel";
import type { ProbeResult } from "#/lib/environment/types/probe";
import type { ConnectorFormValues } from "#/lib/environment/validation";

function EnvironmentConnectionsScreen() {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: connections } = useConnections();
  const { data: profile } = useEnvironmentProfile();

  const [search, setSearch] = React.useState("");
  const [activeManifest, setActiveManifest] =
    React.useState<ConnectorManifest | null>(null);
  const [busyProvider, setBusyProvider] = React.useState<string | null>(null);
  const [lastProbe, setLastProbe] = React.useState<ProbeResult | null>(null);

  // The OAuth callback bounces back here with a result in the query string,
  // matching how connections-settings.tsx already handles ?connected=/?error=.
  React.useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (!connected && !error) return;
    if (connected) {
      displaySuccessToast(t(I18nKey.ENVIRONMENT$STATUS_OK));
      void invalidateConnectionCaches(queryClient);
    }
    if (error) displayErrorToast(error);
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient, t]);

  const visibleManifests = React.useMemo(() => {
    let manifests = CONNECTOR_MANIFESTS;
    // Residency and air-gap are exclusions, not warnings: a provider that
    // cannot legally or physically serve this deployment should not be
    // offered at all.
    manifests = filterByResidency(manifests, profile?.policy.dataResidency);
    if (profile?.mode === "air-gapped") manifests = filterForAirGap(manifests);
    if (!search.trim()) return manifests;
    const needle = search.trim().toLowerCase();
    return manifests.filter(
      (manifest) =>
        manifest.id.includes(needle) ||
        t(manifest.nameKey).toLowerCase().includes(needle) ||
        t(manifest.descriptionKey).toLowerCase().includes(needle),
    );
  }, [profile, search, t]);

  const connectionFor = React.useCallback(
    (manifest: ConnectorManifest) =>
      connections?.find(
        (connection) =>
          connection.providerId === manifest.id &&
          connection.instanceKey === "default",
      ),
    [connections],
  );

  const handleConnect = React.useCallback(
    async (manifest: ConnectorManifest) => {
      // OAuth providers with nothing to fill in go straight to the redirect;
      // everything else needs the form first.
      if (manifest.oauth && manifest.fields.length === 0) {
        setBusyProvider(manifest.id);
        try {
          const { authorizeUrl } = await EnvironmentService.startOAuth({
            capability: manifest.capability,
            providerId: manifest.id,
            returnTo: "/environment/connections",
          });
          window.location.href = authorizeUrl;
        } catch (error) {
          displayErrorToast(
            error instanceof EnvironmentServiceError
              ? error.message
              : t(I18nKey.ENVIRONMENT$ERROR_SAVE),
          );
          setBusyProvider(null);
        }
        return;
      }
      setActiveManifest(manifest);
      setLastProbe(null);
    },
    [t],
  );

  const handleSubmit = React.useCallback(
    async (manifest: ConnectorManifest, values: ConnectorFormValues) => {
      setBusyProvider(manifest.id);
      try {
        const secretNames = new Set(secretFieldNames(manifest));
        const credentials: ConnectorFormValues = {};
        const config: Record<string, string> = {};
        for (const [name, value] of Object.entries(values)) {
          if (!value) continue;
          if (secretNames.has(name)) credentials[name] = value;
          else config[name] = value;
        }

        if (manifest.oauth) {
          // Host-override OAuth providers collect their host first, then
          // redirect -- the authorize URL cannot be built without it.
          const { authorizeUrl } = await EnvironmentService.startOAuth({
            capability: manifest.capability,
            providerId: manifest.id,
            config,
            returnTo: "/environment/connections",
          });
          window.location.href = authorizeUrl;
          return;
        }

        const receipt = await EnvironmentService.setCredentials({
          capability: manifest.capability,
          providerId: manifest.id,
          config,
          credentials,
        });
        setLastProbe(receipt.probe ?? null);
        setActiveManifest(null);
        displaySuccessToast(t(I18nKey.ENVIRONMENT$RECEIPT_TITLE));
        await invalidateConnectionCaches(queryClient);
      } catch (error) {
        displayErrorToast(
          error instanceof EnvironmentServiceError
            ? error.message
            : t(I18nKey.ENVIRONMENT$ERROR_SAVE),
        );
      } finally {
        setBusyProvider(null);
      }
    },
    [queryClient, t],
  );

  const handleTest = React.useCallback(
    async (connection: ConnectionRecord) => {
      setBusyProvider(connection.providerId);
      try {
        const result = await EnvironmentService.probeConnection(connection.id);
        setLastProbe(result);
        await invalidateConnectionCaches(queryClient);
      } catch (error) {
        displayErrorToast(
          error instanceof EnvironmentServiceError
            ? error.message
            : t(I18nKey.ENVIRONMENT$ERROR_PROBE),
        );
      } finally {
        setBusyProvider(null);
      }
    },
    [queryClient, t],
  );

  const handleDisconnect = React.useCallback(
    async (connection: ConnectionRecord) => {
      setBusyProvider(connection.providerId);
      try {
        await EnvironmentService.disconnect(connection.id);
        await invalidateConnectionCaches(queryClient);
      } catch (error) {
        displayErrorToast(
          error instanceof EnvironmentServiceError
            ? error.message
            : t(I18nKey.ENVIRONMENT$ERROR_SAVE),
        );
      } finally {
        setBusyProvider(null);
      }
    },
    [queryClient, t],
  );

  if (!isSupabaseConfigured) {
    return (
      <div
        data-testid="environment-connections-unconfigured"
        className="ame-alert ame-alert-info"
      >
        {t(I18nKey.ENVIRONMENT$SUPABASE_REQUIRED)}
      </div>
    );
  }

  return (
    <div
      data-testid="environment-connections"
      className="flex flex-col gap-5 pb-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          {t(I18nKey.ENVIRONMENT$CONNECTIONS_SUBTITLE)}
        </p>
        <label className="relative flex items-center">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 text-[var(--text-tertiary)]"
          />
          <input
            type="search"
            data-testid="connector-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(I18nKey.ENVIRONMENT$SEARCH_PROVIDERS)}
            aria-label={t(I18nKey.ENVIRONMENT$SEARCH_PROVIDERS)}
            className="ame-input w-full min-w-[220px] pl-8"
          />
        </label>
      </div>

      {lastProbe ? <ProbeResultPanel result={lastProbe} /> : null}

      {activeManifest ? (
        <section
          data-testid="connection-form-panel"
          className="instrument-panel ame-card flex flex-col gap-4 p-5"
        >
          <div className="flex flex-col gap-0.5">
            <span className="ame-eyebrow">
              {t(CAPABILITY_LABEL_KEY[activeManifest.capability])}
            </span>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {t(activeManifest.nameKey)}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {t(I18nKey.ENVIRONMENT$CREDENTIAL_NOTE)}
            </p>
          </div>
          <ConnectionForm
            manifest={activeManifest}
            submitting={busyProvider === activeManifest.id}
            submitLabel={t(I18nKey.ENVIRONMENT$CREDENTIAL_SUBMIT)}
            onSubmit={(values) => handleSubmit(activeManifest, values)}
            onCancel={() => setActiveManifest(null)}
          />
        </section>
      ) : null}

      {CAPABILITIES.map((capability: Capability) => {
        const manifests = visibleManifests.filter(
          (manifest) => manifest.capability === capability,
        );
        if (manifests.length === 0) return null;
        return (
          <section
            key={capability}
            data-testid={`connector-group-${capability}`}
            className="flex flex-col gap-3"
          >
            <h2 className="ame-eyebrow">
              {t(CAPABILITY_LABEL_KEY[capability])}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {manifests.map((manifest, index) => (
                <ConnectorCard
                  key={manifest.id}
                  manifest={manifest}
                  index={index}
                  connection={connectionFor(manifest)}
                  busy={busyProvider === manifest.id}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  onTest={handleTest}
                />
              ))}
            </div>
          </section>
        );
      })}

      {visibleManifests.length === 0 ? (
        <p
          data-testid="connector-no-results"
          className="text-sm text-[var(--text-secondary)]"
        >
          {t(I18nKey.ENVIRONMENT$NO_PROVIDERS)}
        </p>
      ) : null}
    </div>
  );
}

export default EnvironmentConnectionsScreen;
