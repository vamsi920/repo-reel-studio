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
import { ConnectorLogo } from "../shared/connector-logo";

export interface ConnectorCardProps {
  manifest: ConnectorManifest;
  connection?: ConnectionRecord;
  index: number;
  busy?: boolean;
  onConnect: (manifest: ConnectorManifest) => void;
  onDisconnect: (connection: ConnectionRecord) => void;
  onTest: (connection: ConnectionRecord) => void;
}

export function ConnectorCard({
  manifest,
  connection,
  index,
  busy = false,
  onConnect,
  onDisconnect,
  onTest,
}: ConnectorCardProps) {
  const { t } = useTranslation("openhands");
  const reduceMotion = useReducedMotion();
  const connected = Boolean(connection);
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
            <button
              type="button"
              data-testid={`connector-test-${manifest.id}`}
              disabled={busy}
              onClick={() => onTest(connection)}
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
              className="ame-btn-ghost ame-btn-sm"
            >
              {t(I18nKey.ENVIRONMENT$DISCONNECT)}
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid={`connector-connect-${manifest.id}`}
            disabled={busy}
            onClick={() => onConnect(manifest)}
            className="ame-btn-primary ame-btn-sm"
          >
            {t(I18nKey.ENVIRONMENT$CONNECT)}
          </button>
        )}
        <a
          href={manifest.docsUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-testid={`connector-docs-${manifest.id}`}
          className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <ExternalLink size={12} aria-hidden />
          {manifest.id}
        </a>
      </div>
    </motion.article>
  );
}
