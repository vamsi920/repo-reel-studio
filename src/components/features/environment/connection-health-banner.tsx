import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useConnections } from "#/hooks/query/use-connections";
import {
  needsReconnect,
  oauthConfigFor,
  reconnectKind,
} from "#/lib/environment/connection-health";
import { getConnectorManifest } from "#/lib/environment/registry";
import { EnvironmentService } from "#/api/environment-service/environment-service.api";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
import { buildAgentCanvasPath } from "#/utils/base-path";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

const DISMISSED_STORAGE_KEY = "neo-connection-banner-dismissed";

function readDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(keys: Set<string>): void {
  try {
    sessionStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Dismissal then lasts only until the next render; harmless.
  }
}

/**
 * Tells the user, on any screen, that a connection stopped working and offers
 * the one click that fixes it.
 *
 * Status is written by the server (a refresh the provider rejected, an API
 * call that came back 401, the hourly sweep) and pushed here over Realtime,
 * so this appears without a reload and without anyone opening the
 * Environment page. Dismissal is per session and keyed on the connection's
 * `updatedAt`, so a connection that breaks AGAIN after being repaired is
 * shown again rather than staying dismissed forever.
 */
export function ConnectionHealthBanner() {
  const { t } = useTranslation("openhands");
  const { data: connections } = useConnections();
  const [dismissed, setDismissed] = React.useState<Set<string>>(readDismissed);
  const [busy, setBusy] = React.useState(false);

  const broken = (connections ?? []).filter(
    (connection) =>
      needsReconnect(connection) &&
      !dismissed.has(`${connection.id}:${connection.updatedAt}`),
  );
  const first = broken[0];
  if (!first) return null;

  const manifest = getConnectorManifest(first.providerId);
  const providerName = manifest ? t(manifest.nameKey) : first.providerId;

  const dismiss = () => {
    const next = new Set(dismissed);
    for (const connection of broken) {
      next.add(`${connection.id}:${connection.updatedAt}`);
    }
    writeDismissed(next);
    setDismissed(next);
  };

  const reconnect = async (connection: ConnectionRecord) => {
    const target = getConnectorManifest(connection.providerId);
    if (!target || reconnectKind(target) === "form") {
      // Token-based connectors need a new secret typed into the form.
      window.location.assign(buildAgentCanvasPath("/environment/connections"));
      return;
    }
    setBusy(true);
    try {
      const { authorizeUrl } = await EnvironmentService.startOAuth({
        capability: target.capability,
        providerId: target.id,
        instanceKey: connection.instanceKey,
        config: oauthConfigFor(connection),
        returnTo: `${window.location.pathname}${window.location.search}`,
      });
      window.location.href = authorizeUrl;
    } catch (error) {
      displayErrorToast(
        error instanceof Error
          ? error.message
          : t(I18nKey.ENVIRONMENT$ERROR_SAVE),
      );
      setBusy(false);
    }
  };

  return (
    <div
      role="alert"
      data-testid="connection-health-banner"
      className="mx-3 flex items-center gap-3 rounded-lg border border-[var(--error-500)] bg-[var(--error-bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)]"
    >
      <AlertTriangle
        size={16}
        aria-hidden
        className="shrink-0 text-[var(--error-500)]"
      />
      <span className="min-w-0 flex-1 truncate">
        {t(I18nKey.ENVIRONMENT$RECONNECT_BANNER, { provider: providerName })}
        {broken.length > 1 ? ` (+${broken.length - 1})` : ""}
      </span>
      <button
        type="button"
        data-testid="connection-health-banner-reconnect"
        disabled={busy}
        onClick={() => void reconnect(first)}
        className="ame-btn-primary ame-btn-sm"
      >
        {t(I18nKey.ENVIRONMENT$RECONNECT)}
      </button>
      <button
        type="button"
        data-testid="connection-health-banner-dismiss"
        onClick={dismiss}
        aria-label={t(I18nKey.ENVIRONMENT$RECONNECT_BANNER_DISMISS)}
        className="ame-btn-ghost ame-btn-sm"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
