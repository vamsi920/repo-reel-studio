import { useTranslation } from "react-i18next";
import type { AgentOpsRunStatus } from "#/api/agentops-service/agentops-service.types";
import {
  RUN_STATUS_COLORS,
  RUN_STATUS_LABEL_KEYS,
} from "./agentops-formatting";

interface RunStatusBadgeProps {
  status: AgentOpsRunStatus;
}

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  const { t } = useTranslation("openhands");
  const color = RUN_STATUS_COLORS[status] ?? "var(--text-tertiary)";
  const labelKey = RUN_STATUS_LABEL_KEYS[status];

  return (
    <span
      data-testid={`run-status-${status}`}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {labelKey ? t(labelKey) : status}
    </span>
  );
}
