import {
  AlertTriangle,
  Bot,
  CircleDollarSign,
  Coins,
  PlayCircle,
  ShieldQuestion,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { AgentOpsSummary } from "#/api/agentops-service/agentops-service.types";
import { formatCompactTokenCount, formatCostUsd } from "./agentops-formatting";

interface TileProps {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "default" | "warning" | "danger";
  note?: string;
}

function Tile({ label, value, icon, tone = "default", note }: TileProps) {
  const toneColor =
    tone === "danger"
      ? "var(--error-500)"
      : tone === "warning"
        ? "var(--warning-500)"
        : "var(--primary-500)";

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)] p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex size-8 items-center justify-center rounded-[var(--radius-md)]"
          style={{
            color: toneColor,
            backgroundColor: `color-mix(in srgb, ${toneColor} 12%, transparent)`,
          }}
        >
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
          {label}
        </span>
      </div>
      <span className="text-2xl font-semibold text-[var(--text-primary)]">
        {value}
      </span>
      {note ? (
        <span className="text-xs text-[var(--text-tertiary)]">{note}</span>
      ) : null}
    </div>
  );
}

interface AgentOpsStatTilesProps {
  summary: AgentOpsSummary;
}

export function AgentOpsStatTiles({ summary }: AgentOpsStatTilesProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="agentops-stat-tiles"
      className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"
    >
      <Tile
        label={t(I18nKey.AGENTOPS$TILE_ACTIVE_AGENTS)}
        value={String(summary.activeAgents)}
        icon={<Bot size={16} />}
        note={t(I18nKey.AGENTOPS$ACTIVE_RUNS_COUNT, {
          count: summary.activeRuns,
        })}
      />
      <Tile
        label={t(I18nKey.AGENTOPS$TILE_RUNS_TODAY)}
        value={String(summary.runsToday)}
        icon={<PlayCircle size={16} />}
      />
      <Tile
        label={t(I18nKey.AGENTOPS$TILE_WAITING_APPROVAL)}
        value={String(summary.waitingForApproval)}
        icon={<ShieldQuestion size={16} />}
        tone={summary.waitingForApproval > 0 ? "warning" : "default"}
      />
      <Tile
        label={t(I18nKey.AGENTOPS$TILE_FAILURES)}
        value={String(summary.failures)}
        icon={<AlertTriangle size={16} />}
        tone={summary.failures > 0 ? "danger" : "default"}
      />
      <Tile
        label={t(I18nKey.AGENTOPS$TILE_TOKENS_TODAY)}
        value={formatCompactTokenCount(summary.tokensToday)}
        icon={<Coins size={16} />}
      />
      <Tile
        label={t(I18nKey.AGENTOPS$TILE_COST_TODAY)}
        value={formatCostUsd(summary.costTodayUsd)}
        icon={<CircleDollarSign size={16} />}
        // Cost comes from provider usage metadata. Runs whose provider reported
        // none are called out rather than quietly counted as free.
        note={
          summary.runsTodayWithoutReportedCost > 0
            ? t(I18nKey.AGENTOPS$NO_REPORTED_COST, {
                count: summary.runsTodayWithoutReportedCost,
              })
            : undefined
        }
      />
    </div>
  );
}
