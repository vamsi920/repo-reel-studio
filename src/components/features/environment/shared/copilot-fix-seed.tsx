import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
import type { RequirementNode } from "#/lib/environment/types/requirements";
import { CONNECTION_STATUS_LABEL_KEY } from "#/lib/environment/display";
import { getConnectorManifest } from "#/lib/environment/registry";

/**
 * Finds the connection a "Fix with agent" seed should describe for a
 * capability requirement -- the "default" instance, matching the lookup
 * `environment-overview.tsx`'s capability tiles and `useEnvironmentReadiness`
 * already use for the same capability.
 */
export function findConnectionForNode(
  node: RequirementNode,
  connections: ConnectionRecord[] | undefined,
): ConnectionRecord | undefined {
  if (node.kind !== "capability") return undefined;
  return connections?.find(
    (connection) =>
      connection.capability === node.capability &&
      connection.instanceKey === "default",
  );
}

/**
 * Appends the provider/account/missing-scope diagnostics the app already has
 * on hand (the same facts the Connections tab's "Failing" panel shows) to a
 * "Fix with agent" seed message, so the onboarding copilot does not have to
 * ask the user to re-explain a failure the app already diagnosed -- e.g.
 * "Source control — Browsing repositories (GitHub, vamsi920, Failing,
 * Missing: read:user, repo)" instead of just "Source control — Browsing
 * repositories".
 */
export function useFixSeedConnectionContext(): (
  connection: ConnectionRecord | undefined,
) => string {
  const { t } = useTranslation("openhands");

  return (connection) => {
    if (!connection) return "";
    const manifest = getConnectorManifest(connection.providerId);
    const providerName = manifest ? t(manifest.nameKey) : connection.providerId;
    const missingScopes = connection.requestedScopes.filter(
      (scope) => !connection.grantedScopes.includes(scope),
    );
    const parts = [providerName];
    if (connection.displayName) parts.push(connection.displayName);
    parts.push(t(CONNECTION_STATUS_LABEL_KEY[connection.status]));
    if (missingScopes.length > 0) {
      parts.push(
        `${t(I18nKey.ENVIRONMENT$SCOPES_MISSING)}: ${missingScopes.join(", ")}`,
      );
    }
    return ` (${parts.join(", ")})`;
  };
}
