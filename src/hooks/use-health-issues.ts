import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useConnections } from "#/hooks/query/use-connections";
import { useSettings } from "#/hooks/query/use-settings";
import {
  expiresSoon,
  needsReconnect,
} from "#/lib/environment/connection-health";
import { getConnectorManifest } from "#/lib/environment/registry";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
import {
  getMcpHealthSnapshot,
  subscribeMcpHealth,
} from "#/api/mcp-health/mcp-health-store";
import { getMcpServerHealthKey } from "#/utils/mcp-server-health-key";
import { parseMcpConfig } from "#/utils/mcp-config";
import { flattenMcpConfig } from "#/utils/mcp-installed-servers";
import { useModelRoutingStore } from "#/stores/model-routing-store";
import { useGithubCredentialHealth } from "#/hooks/query/use-github-credential-health";

/**
 * Everything, app-wide, that has stopped working (or is about to) and needs
 * the user to act -- one list so one banner can say it.
 *
 * Sources:
 * - org connections the server marked expired/revoked (Realtime-pushed);
 * - org connections whose non-renewable token lapses within three days;
 * - MCP servers whose last test rejected their credentials;
 * - saved LLM profiles whose key the provider rejected mid-conversation;
 * - the GitHub credential automation runs use, when GitHub rejects it.
 *
 * `key` changes when the underlying problem changes (it embeds the
 * connection's `updatedAt` / the failure time), so a dismissed issue that
 * comes back later is shown again.
 */
export type HealthIssueKind =
  | "connection-reconnect"
  | "connection-expiring"
  | "mcp-credentials"
  | "llm-auth"
  | "github-credential";

export interface HealthIssue {
  key: string;
  kind: HealthIssueKind;
  message: string;
  /** Only for connection issues: the record the reconnect acts on. */
  connection?: ConnectionRecord;
  /** Route that fixes it, for issues fixed on another screen. */
  fixPath?: string;
}

export const MCP_FIX_PATH = "/mcp";
export const LLM_FIX_PATH = "/settings";
export const GITHUB_FIX_PATH = "/settings/connections";

export function useHealthIssues(): HealthIssue[] {
  const { t } = useTranslation("openhands");
  const { data: connections } = useConnections();
  const { data: settings } = useSettings();
  const mcpHealth = React.useSyncExternalStore(
    subscribeMcpHealth,
    getMcpHealthSnapshot,
    getMcpHealthSnapshot,
  );
  const llmHealth = useModelRoutingStore((state) => state.health);
  const llmProfiles = useModelRoutingStore((state) => state.profiles);
  const githubCredential = useGithubCredentialHealth();

  return React.useMemo(() => {
    const issues: HealthIssue[] = [];

    for (const connection of connections ?? []) {
      const manifest = getConnectorManifest(connection.providerId);
      const provider = manifest ? t(manifest.nameKey) : connection.providerId;
      if (needsReconnect(connection)) {
        issues.push({
          key: `conn:${connection.id}:${connection.updatedAt}`,
          kind: "connection-reconnect",
          message: t(I18nKey.ENVIRONMENT$RECONNECT_BANNER, { provider }),
          connection,
        });
        continue;
      }
      const at = expiresSoon(connection, manifest);
      if (at) {
        issues.push({
          key: `expiring:${connection.id}:${connection.expiresAt}`,
          kind: "connection-expiring",
          message: t(I18nKey.ENVIRONMENT$EXPIRES_SOON_BANNER, {
            provider,
            date: at.toLocaleDateString(),
          }),
          connection,
        });
      }
    }

    const mcpConfig =
      settings?.mcp_config ??
      parseMcpConfig(settings?.agent_settings?.mcp_config);
    for (const server of flattenMcpConfig(mcpConfig)) {
      const health = mcpHealth[getMcpServerHealthKey(server)];
      if (health?.status === "failed" && health.kind === "credentials") {
        issues.push({
          key: `mcp:${getMcpServerHealthKey(server)}:${health.checkedAt}`,
          kind: "mcp-credentials",
          message: t(I18nKey.ENVIRONMENT$MCP_CREDENTIALS_BANNER, {
            server: server.name,
          }),
          fixPath: MCP_FIX_PATH,
        });
      }
    }

    const knownProfiles = new Set(llmProfiles.map((profile) => profile.name));
    for (const [name, health] of Object.entries(llmHealth)) {
      if (
        knownProfiles.has(name) &&
        health.misconfigured &&
        health.lastErrorKind === "auth"
      ) {
        issues.push({
          key: `llm:${name}:${health.lastChangedAt}`,
          kind: "llm-auth",
          message: t(I18nKey.ENVIRONMENT$LLM_AUTH_BANNER, { profile: name }),
          fixPath: LLM_FIX_PATH,
        });
      }
    }

    if (githubCredential === "rejected") {
      issues.push({
        key: "github-credential:rejected",
        kind: "github-credential",
        message: t(I18nKey.ENVIRONMENT$GITHUB_CREDENTIAL_BANNER),
        fixPath: GITHUB_FIX_PATH,
      });
    }

    return issues;
  }, [
    connections,
    settings,
    mcpHealth,
    llmHealth,
    llmProfiles,
    githubCredential,
    t,
  ]);
}
