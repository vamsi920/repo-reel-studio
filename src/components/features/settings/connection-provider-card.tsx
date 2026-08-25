import React from "react";
import { BrandButton } from "#/components/features/settings/brand-button";

interface ConnectionProviderCardProps {
  icon: React.ReactNode;
  label: string;
  isConnected: boolean;
  statusText: string;
  isBusy: boolean;
  busyLabel: string;
  actionLabel: string;
  onAction: () => void;
  testIdPrefix: string;
  /** Extra content shown only while disconnected (e.g. an enterprise-host
   * toggle) or only while connected (e.g. a recent-issues list). */
  children?: React.ReactNode;
}

/** One provider row in Settings > Connections -- GitHub, Jira, etc. all
 * share this shell so adding a third provider is a one-card addition. */
export function ConnectionProviderCard({
  icon,
  label,
  isConnected,
  statusText,
  isBusy,
  busyLabel,
  actionLabel,
  onAction,
  testIdPrefix,
  children,
}: ConnectionProviderCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-[var(--oh-border)] p-4">
      <div className="flex items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{label}</p>
          <p
            data-testid={`${testIdPrefix}-connection-status`}
            className="truncate text-xs text-tertiary-light"
          >
            {statusText}
          </p>
        </div>
        <BrandButton
          testId={`${testIdPrefix}-${isConnected ? "disconnect" : "connect"}-button`}
          type="button"
          variant={isConnected ? "secondary" : "primary"}
          onClick={onAction}
          isDisabled={isBusy}
        >
          {isBusy ? busyLabel : actionLabel}
        </BrandButton>
      </div>
      {children}
    </div>
  );
}
