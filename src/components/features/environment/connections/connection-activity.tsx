import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useConnectionEvents } from "#/hooks/query/use-connection-events";
import { getConnectorManifest } from "#/lib/environment/registry";
import { CONNECTION_STATUS_LABEL_KEY } from "#/lib/environment/display";
import type {
  ConnectionEventAction,
  ConnectionEventRecord,
} from "#/lib/data-platform/repositories/connection-events-repository";
import type { ConnectionStatus } from "#/lib/environment/types/probe";

const ACTION_LABEL_KEY: Record<ConnectionEventAction, I18nKey> = {
  connected: I18nKey.ENVIRONMENT$ACTIVITY_CONNECTED,
  disconnected: I18nKey.ENVIRONMENT$ACTIVITY_DISCONNECTED,
  refreshed: I18nKey.ENVIRONMENT$ACTIVITY_REFRESHED,
  status_changed: I18nKey.ENVIRONMENT$ACTIVITY_STATUS_CHANGED,
};

function isConnectionStatus(value: string | null): value is ConnectionStatus {
  return Boolean(value && value in CONNECTION_STATUS_LABEL_KEY);
}

/**
 * Who connected, disconnected or renewed what, and when a connection's health
 * changed -- the record that answers "it was working yesterday".
 */
export function ConnectionActivity() {
  const { t } = useTranslation("openhands");
  const { data: events, isPending, isError } = useConnectionEvents();

  const describe = (event: ConnectionEventRecord) => {
    const manifest = getConnectorManifest(event.providerId);
    const provider = manifest ? t(manifest.nameKey) : event.providerId;
    const status = isConnectionStatus(event.status)
      ? t(CONNECTION_STATUS_LABEL_KEY[event.status])
      : (event.status ?? "");
    return t(ACTION_LABEL_KEY[event.action], { provider, status });
  };

  return (
    <section
      data-testid="connection-activity"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <h2 className="ame-eyebrow flex items-center gap-1.5">
        <History size={12} aria-hidden />
        {t(I18nKey.ENVIRONMENT$ACTIVITY_TITLE)}
      </h2>
      {isError ? (
        <p className="text-xs text-[var(--error-500)]">
          {t(I18nKey.ENVIRONMENT$ACTIVITY_LOAD_ERROR)}
        </p>
      ) : null}
      {!isPending && !isError && (events ?? []).length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          {t(I18nKey.ENVIRONMENT$ACTIVITY_EMPTY)}
        </p>
      ) : null}
      {events && events.length > 0 ? (
        <ul
          className="flex flex-col gap-1"
          data-testid="connection-activity-list"
        >
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="min-w-0 truncate text-[var(--text-secondary)]">
                {describe(event)}
              </span>
              <time
                dateTime={event.createdAt}
                className="shrink-0 text-[var(--text-tertiary)]"
              >
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
