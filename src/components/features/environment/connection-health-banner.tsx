import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  oauthConfigFor,
  reconnectKind,
} from "#/lib/environment/connection-health";
import { getConnectorManifest } from "#/lib/environment/registry";
import { EnvironmentService } from "#/api/environment-service/environment-service.api";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
import { useNavigation } from "#/context/navigation-context";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useHealthIssues, type HealthIssue } from "#/hooks/use-health-issues";

const DISMISSED_STORAGE_KEY = "neo-connection-banner-dismissed";
const CONNECTIONS_PATH = "/environment/connections";

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
 * Tells the user, on any screen, that something they connected stopped
 * working -- or is about to -- and offers the one click that fixes it.
 *
 * Covers org connections (pushed over Realtime from the server's verdicts and
 * the hourly sweep), tokens about to lapse, MCP servers whose credentials were
 * rejected, and LLM profiles whose key a provider rejected. Broken things are
 * shown before merely-expiring ones. Dismissal is per session and keyed on
 * the problem itself, so a problem that recurs is shown again.
 */
export function ConnectionHealthBanner() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const issues = useHealthIssues();
  const [dismissed, setDismissed] = React.useState<Set<string>>(readDismissed);
  const [busy, setBusy] = React.useState(false);

  const visible = issues
    .filter((issue) => !dismissed.has(issue.key))
    // Broken before expiring: a warning must never hide an outage.
    .sort(
      (a, b) =>
        Number(a.kind === "connection-expiring") -
        Number(b.kind === "connection-expiring"),
    );
  const first = visible[0];
  if (!first) return null;
  const warningOnly = visible.every(
    (issue) => issue.kind === "connection-expiring",
  );

  const dismiss = () => {
    const next = new Set(dismissed);
    for (const issue of visible) next.add(issue.key);
    writeDismissed(next);
    setDismissed(next);
  };

  const reconnect = async (connection: ConnectionRecord) => {
    const target = getConnectorManifest(connection.providerId);
    if (!target || reconnectKind(target) === "form") {
      // Token-based connectors need a new secret typed into the form.
      navigate(CONNECTIONS_PATH);
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

  const act = (issue: HealthIssue) => {
    if (issue.connection) {
      void reconnect(issue.connection);
      return;
    }
    if (issue.fixPath) navigate(issue.fixPath);
  };

  const actionLabel =
    first.kind === "connection-reconnect" ||
    first.kind === "connection-expiring"
      ? t(I18nKey.ENVIRONMENT$RECONNECT)
      : t(I18nKey.ENVIRONMENT$FIX_ISSUE);

  return (
    <div
      role={warningOnly ? "status" : "alert"}
      data-testid="connection-health-banner"
      data-kind={first.kind}
      className={cn(
        "mx-3 flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-[var(--text-primary)]",
        warningOnly
          ? "border-[var(--warning-500)] bg-[var(--warning-bg-subtle)]"
          : "border-[var(--error-500)] bg-[var(--error-bg-subtle)]",
      )}
    >
      {warningOnly ? (
        <Clock
          size={16}
          aria-hidden
          className="shrink-0 text-[var(--warning-500)]"
        />
      ) : (
        <AlertTriangle
          size={16}
          aria-hidden
          className="shrink-0 text-[var(--error-500)]"
        />
      )}
      <span className="min-w-0 flex-1 truncate">
        {first.message}
        {visible.length > 1
          ? ` ${t(I18nKey.ENVIRONMENT$MORE_ISSUES, { count: visible.length - 1 })}`
          : ""}
      </span>
      <button
        type="button"
        data-testid="connection-health-banner-reconnect"
        disabled={busy}
        onClick={() => act(first)}
        className="ame-btn-primary ame-btn-sm"
      >
        {actionLabel}
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
