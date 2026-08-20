import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { CollectorUnavailable } from "./collector-unavailable";

interface AgentOpsPanelProps {
  isLoading: boolean;
  error: unknown;
  children: ReactNode;
}

/**
 * Query-state wrapper shared by the Control Tower tabs.
 *
 * Any error is treated as "no real telemetry available" and routed to
 * {@link CollectorUnavailable}, because that is what an error means here: the
 * collector is down, unreachable, or rejecting us. There is no partial or
 * placeholder rendering.
 */
export function AgentOpsPanel({
  isLoading,
  error,
  children,
}: AgentOpsPanelProps) {
  const { t } = useTranslation("openhands");

  if (error) return <CollectorUnavailable error={error} />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-[var(--text-secondary)]">
        <Loader2 size={16} className="animate-spin" />
        {t(I18nKey.AGENTOPS$LOADING)}
      </div>
    );
  }

  return <>{children}</>;
}
