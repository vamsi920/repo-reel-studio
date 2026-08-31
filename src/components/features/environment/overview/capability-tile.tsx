import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { Capability } from "#/lib/environment/types/capability";
import type { CapabilityStatus } from "#/lib/environment/types/requirements";
import { CAPABILITY_LABEL_KEY } from "#/lib/environment/display";
import { getConnectorManifest } from "#/lib/environment/registry";
import { ConnectorLogo } from "../shared/connector-logo";
import { StatusPip } from "../shared/status-pip";

export interface CapabilityTileProps {
  capability: Capability;
  status: CapabilityStatus;
  providerId?: string;
  index: number;
}

export function CapabilityTile({
  capability,
  status,
  providerId,
  index,
}: CapabilityTileProps) {
  const { t } = useTranslation("openhands");
  const reduceMotion = useReducedMotion();
  const manifest = providerId ? getConnectorManifest(providerId) : undefined;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : // Staggered by index so the grid resolves left-to-right instead of
            // all twelve tiles popping at once.
            { duration: 0.28, delay: Math.min(index * 0.035, 0.35) }
      }
    >
      <Link
        to="/environment/connections"
        data-testid={`capability-tile-${capability}`}
        data-status={status}
        className={cn(
          "ame-card ame-card-interactive flex h-full flex-col gap-3 p-4",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-500)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="ame-eyebrow">
            {t(CAPABILITY_LABEL_KEY[capability])}
          </span>
          <StatusPip
            status={status}
            showLabel={false}
            testId={`capability-pip-${capability}`}
          />
        </div>

        <div className="flex items-center gap-3">
          {manifest ? (
            <ConnectorLogo logo={manifest.logo} size={28} />
          ) : (
            <span
              aria-hidden
              className="inline-block size-7 rounded-[9px] border border-dashed border-[var(--border-color)]"
            />
          )}
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {manifest
              ? t(manifest.nameKey)
              : t(I18nKey.ENVIRONMENT$STATUS_MISSING)}
          </span>
        </div>

        <StatusPip
          status={status}
          className="mt-auto"
          testId={`capability-status-${capability}`}
        />
      </Link>
    </motion.div>
  );
}
