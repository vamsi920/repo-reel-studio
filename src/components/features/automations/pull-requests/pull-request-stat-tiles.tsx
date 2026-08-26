import { CalendarClock, CheckCircle2, CircleDot, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { NeodevexPullRequest } from "#/api/git-service/local-github-service.api";

interface TileProps {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "default" | "success";
}

function Tile({ label, value, icon, tone = "default" }: TileProps) {
  const toneColor =
    tone === "success" ? "var(--oh-success)" : "var(--oh-primary, #6366f1)";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex size-8 items-center justify-center rounded-md"
          style={{
            color: toneColor,
            backgroundColor: `color-mix(in srgb, ${toneColor} 12%, transparent)`,
          }}
        >
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
      </div>
      <span className="text-2xl font-semibold text-content">{value}</span>
    </div>
  );
}

function isThisWeek(dateStr: string): boolean {
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return new Date(dateStr).getTime() >= sevenDaysAgoMs;
}

interface PullRequestStatTilesProps {
  pullRequests: NeodevexPullRequest[];
}

export function PullRequestStatTiles({
  pullRequests,
}: PullRequestStatTilesProps) {
  const { t } = useTranslation("openhands");

  const open = pullRequests.filter((pr) => pr.state === "open").length;
  const merged = pullRequests.filter((pr) => pr.state === "merged").length;
  const closed = pullRequests.filter((pr) => pr.state === "closed").length;
  const openedThisWeek = pullRequests.filter((pr) =>
    isThisWeek(pr.createdAt),
  ).length;

  return (
    <div
      data-testid="pull-request-stat-tiles"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <Tile
        label={t(I18nKey.AUTOMATIONS$PULL_REQUESTS$TILE_OPEN)}
        value={String(open)}
        icon={<CircleDot size={16} />}
        tone="success"
      />
      <Tile
        label={t(I18nKey.AUTOMATIONS$PULL_REQUESTS$TILE_MERGED)}
        value={String(merged)}
        icon={<CheckCircle2 size={16} />}
      />
      <Tile
        label={t(I18nKey.AUTOMATIONS$PULL_REQUESTS$TILE_CLOSED)}
        value={String(closed)}
        icon={<XCircle size={16} />}
      />
      <Tile
        label={t(I18nKey.AUTOMATIONS$PULL_REQUESTS$TILE_THIS_WEEK)}
        value={String(openedThisWeek)}
        icon={<CalendarClock size={16} />}
      />
    </div>
  );
}
