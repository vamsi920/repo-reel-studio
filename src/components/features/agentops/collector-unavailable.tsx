import { Terminal, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { isAgentOpsSupportedBackend } from "#/api/agentops-service/agentops-service.api";

interface CollectorUnavailableProps {
  error: unknown;
}

/** The command that starts the collector when it is not already running. */
const COLLECTOR_COMMAND = "node scripts/agentops-server.mjs";

/**
 * What the Control Tower shows when it has no real telemetry.
 *
 * There is deliberately no fallback to sample data here. An observability
 * surface that renders plausible-looking runs when its collector is down is
 * worse than one that renders nothing, so this states the cause and the fix.
 */
export function CollectorUnavailable({ error }: CollectorUnavailableProps) {
  const { t } = useTranslation("openhands");
  const unsupportedBackend = !isAgentOpsSupportedBackend();
  const message = error instanceof Error ? error.message : String(error ?? "");

  return (
    <div
      data-testid="agentops-collector-unavailable"
      className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)] p-8 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--warning-bg-subtle)] text-[var(--warning-500)]">
        <TriangleAlert size={22} />
      </div>

      {unsupportedBackend ? (
        <>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {t(I18nKey.AGENTOPS$BACKEND_UNSUPPORTED_TITLE)}
          </h2>
          <p className="max-w-md text-sm text-[var(--text-secondary)]">
            {t(I18nKey.AGENTOPS$BACKEND_UNSUPPORTED_BODY)}
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {t(I18nKey.AGENTOPS$COLLECTOR_DOWN_TITLE)}
          </h2>
          <p className="max-w-md text-sm text-[var(--text-secondary)]">
            {t(I18nKey.AGENTOPS$COLLECTOR_DOWN_BODY)}
          </p>
          <div className="flex w-full max-w-md items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background-secondary)] px-3 py-2 text-left">
            <Terminal
              size={16}
              className="shrink-0 text-[var(--text-tertiary)]"
            />
            <code className="truncate font-mono text-xs text-[var(--text-primary)]">
              {COLLECTOR_COMMAND}
            </code>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.AGENTOPS$COLLECTOR_DOWN_HINT)}
          </p>
          {message ? (
            <p className="max-w-md break-words text-xs text-[var(--text-tertiary)]">
              {message}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
