import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { ConnectorManifest } from "#/lib/environment/types/capability";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
import {
  CONNECTION_STATUS_LABEL_KEY,
  MATURITY_LABEL_KEY,
} from "#/lib/environment/display";
import { needsReconnect } from "#/lib/environment/connection-health";
import { ConnectorLogo } from "../shared/connector-logo";

export interface ConnectorCardProps {
  manifest: ConnectorManifest;
  connection?: ConnectionRecord;
  index: number;
  busy?: boolean;
  /**
   * True while the connections list has not resolved its first answer yet
   * (e.g. still gated behind the auth/org bootstrap on a fresh page load).
   * `connection` is indistinguishable from "confirmed disconnected" in that
   * window, so the Connect button is held off rather than offering a
   * redundant/misleading "Connect" action on a provider that may already be
   * connected.
   */
  pending?: boolean;
  onConnect: (manifest: ConnectorManifest) => void;
  onDisconnect: (connection: ConnectionRecord) => void;
  onTest: (connection: ConnectionRecord) => void;
  /**
   * Starts the reconnect flow for a connection that stopped working. The
   * button is rendered only when this is provided AND the connection needs
   * it, so the card never shows a control that does nothing.
   */
  onReconnect?: (connection: ConnectionRecord) => void;
}

export function ConnectorCard({
  manifest,
  connection,
  index,
  busy = false,
  pending = false,
  onConnect,
  onDisconnect,
  onTest,
  onReconnect,
}: ConnectorCardProps) {
  const { t } = useTranslation("openhands");
  const reduceMotion = useReducedMotion();
  const connected = Boolean(connection);
  const reconnectNeeded = needsReconnect(connection);
  const missingScopes = connection
    ? connection.requestedScopes.filter(
        (scope) => !connection.grantedScopes.includes(scope),
      )
    : [];

  return (
    <motion.article
      data-testid={`connector-card-${manifest.id}`}
      data-connected={connected}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.24, delay: Math.min(index * 0.025, 0.3) }
      }
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-start gap-3">
        <ConnectorLogo logo={manifest.logo} size={36} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(manifest.nameKey)}
            </h3>
            {manifest.maturity !== "ga" ? (
              <span className="ame-badge ame-badge-neutral">
                {t(MATURITY_LABEL_KEY[manifest.maturity])}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {t(manifest.descriptionKey)}
          </p>
        </div>
      </div>

      {connection ? (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] bg-[var(--background-secondary)] px-3 py-2">
          <span
            className={cn(
              "ame-badge self-start",
              connection.status === "ok"
                ? "ame-badge-success"
                : connection.status === "degraded"
                  ? "ame-badge-warning"
                  : connection.status === "unverified"
                    ? "ame-badge-neutral"
                    : "ame-badge-danger",
            )}
          >
            {t(CONNECTION_STATUS_LABEL_KEY[connection.status])}
          </span>
          {connection.displayName ? (
            <span className="truncate text-xs text-[var(--text-secondary)]">
              {connection.displayName}
            </span>
          ) : null}
          {reconnectNeeded ? (
            <span
              data-testid={`connector-needs-reconnect-${manifest.id}`}
              className="text-xs text-[var(--error-500)]"
            >
              {t(I18nKey.ENVIRONMENT$NEEDS_RECONNECT_HINT)}
            </span>
          ) : null}
          {/* Scope downgrade is the difference between "connected" and
              "connected, and something will 403 next week". It gets its own
              line rather than hiding inside the probe detail. */}
          {missingScopes.length > 0 ? (
            <span className="text-xs text-[var(--warning-500)]">
              {`${t(I18nKey.ENVIRONMENT$SCOPES_MISSING)}: ${missingScopes.join(", ")}`}
            </span>
          ) : null}
          {connection.expiresAt ? (
            <span className="text-xs text-[var(--text-tertiary)]">
              {`${t(I18nKey.ENVIRONMENT$CREDENTIAL_EXPIRES)}: ${new Date(connection.expiresAt).toLocaleDateString()}`}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {connection ? (
          <>
            {reconnectNeeded && onReconnect ? (
              <button
                type="button"
                data-testid={`connector-reconnect-${manifest.id}`}
                disabled={busy}
                onClick={() => onReconnect(connection)}
                aria-label={t(I18nKey.ENVIRONMENT$RECONNECT_PROVIDER, {
                  provider: t(manifest.nameKey),
                })}
                className={cn("ame-btn-primary ame-btn-sm", busy && "loading")}
              >
                {t(I18nKey.ENVIRONMENT$RECONNECT)}
              </button>
            ) : null}
            <button
              type="button"
              data-testid={`connector-test-${manifest.id}`}
              disabled={busy}
              onClick={() => onTest(connection)}
              aria-label={t(I18nKey.ENVIRONMENT$TEST_CONNECTION_FOR, {
                provider: t(manifest.nameKey),
              })}
              className={cn("ame-btn-secondary ame-btn-sm", busy && "loading")}
            >
              {busy
                ? t(I18nKey.ENVIRONMENT$TESTING_CONNECTION)
                : t(I18nKey.ENVIRONMENT$TEST_CONNECTION)}
            </button>
            <button
              type="button"
              data-testid={`connector-disconnect-${manifest.id}`}
              disabled={busy}
              onClick={() => onDisconnect(connection)}
              aria-label={t(I18nKey.ENVIRONMENT$DISCONNECT_PROVIDER, {
                provider: t(manifest.nameKey),
              })}
              className="ame-btn-ghost ame-btn-sm"
            >
              {t(I18nKey.ENVIRONMENT$DISCONNECT)}
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid={`connector-connect-${manifest.id}`}
            disabled={busy || pending}
            onClick={() => onConnect(manifest)}
            aria-label={t(I18nKey.ENVIRONMENT$CONNECT_PROVIDER, {
              provider: t(manifest.nameKey),
            })}
            className={cn("ame-btn-primary ame-btn-sm", pending && "loading")}
          >
            {t(I18nKey.ENVIRONMENT$CONNECT)}
          </button>
        )}
        <a
          href={manifest.docsUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-testid={`connector-docs-${manifest.id}`}
          aria-label={t(I18nKey.ENVIRONMENT$VIEW_DOCS_FOR, {
            provider: t(manifest.nameKey),
          })}
          className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <ExternalLink size={12} aria-hidden />
          {t(I18nKey.ENVIRONMENT$VIEW_DOCS)}
        </a>
      </div>
    </motion.article>
  );
}
