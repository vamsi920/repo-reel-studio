import { useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Clock,
  ChevronRight,
  Play,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoGenerationPlan, ChapterStatus } from "@/lib/types";

interface Props {
  plan: VideoGenerationPlan;
  onGoToStudio: () => void;
}

const statusConfig: Record<
  ChapterStatus,
  { label: string; color: string; icon: React.ElementType; animate?: boolean }
> = {
  pending: { label: "Queued", color: "text-white/28", icon: Clock },
  outlining: {
    label: "Outlining...",
    color: "text-primary",
    icon: Loader2,
    animate: true,
  },
  writing: {
    label: "Writing script...",
    color: "text-primary",
    icon: Loader2,
    animate: true,
  },
  enriching: {
    label: "Attaching code...",
    color: "text-amber-300",
    icon: Loader2,
    animate: true,
  },
  tts: {
    label: "Generating voice...",
    color: "text-violet-300",
    icon: Loader2,
    animate: true,
  },
  ready: { label: "Ready", color: "text-emerald-300", icon: CheckCircle2 },
  error: { label: "Failed", color: "text-rose-300", icon: AlertTriangle },
};

const ChapterRow = ({
  title,
  order,
  status,
  durationSeconds,
  sceneCount,
  error,
}: {
  title: string;
  order: number;
  status: ChapterStatus;
  durationSeconds?: number;
  sceneCount?: number;
  error?: string;
}) => {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;
  const mins = durationSeconds ? Math.floor(durationSeconds / 60) : 0;
  const secs = durationSeconds ? durationSeconds % 60 : 0;

  return (
    <div
      className={`rounded-xl p-4 transition-all ${
        status === "ready"
          ? "bg-emerald-300/6 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.12)]"
          : status === "error"
            ? "bg-rose-300/6 shadow-[inset_0_0_0_1px_rgba(252,165,165,0.12)]"
            : status === "pending"
              ? "bg-white/[0.02] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
              : "bg-primary/6 shadow-[inset_0_0_0_1px_rgba(104,132,255,0.16)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-bold text-white/40">
          {order + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white/72 truncate">{title}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <Icon
              className={`h-3.5 w-3.5 ${cfg.color} ${cfg.animate ? "animate-spin" : ""}`}
            />
            <span className={`text-[11px] ${cfg.color}`}>{cfg.label}</span>
            {status === "ready" && sceneCount != null && (
              <span className="text-[11px] text-white/28">
                {sceneCount} scenes
              </span>
            )}
            {status === "ready" && durationSeconds != null && (
              <span className="text-[11px] text-white/28">
                {mins}:{secs.toString().padStart(2, "0")}
              </span>
            )}
          </div>
          {error && (
            <p className="mt-1 text-[11px] text-rose-300/70 truncate">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export const ChapterGenerationProgress = ({ plan, onGoToStudio }: Props) => {
  const readyCount = plan.chapters.filter((ch) => ch.status === "ready").length;
  const errorCount = plan.chapters.filter((ch) => ch.status === "error").length;
  const totalChapters = plan.chapters.length;
  const isComplete = readyCount + errorCount === totalChapters;
  const hasAnyReady = readyCount > 0;

  const totalDuration = useMemo(() => {
    const secs = plan.chapters
      .filter((ch) => ch.status === "ready")
      .reduce((sum, ch) => sum + (ch.actual_duration_seconds ?? 0), 0);
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  }, [plan.chapters]);

  const totalScenes = useMemo(
    () =>
      plan.chapters
        .filter((ch) => ch.status === "ready" && ch.manifest)
        .reduce((sum, ch) => sum + (ch.manifest?.scenes.length ?? 0), 0),
    [plan.chapters]
  );

  const pct = totalChapters > 0 ? Math.round((readyCount / totalChapters) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl gf-panel p-5 shadow-[0_18px_44px_rgba(8,14,30,0.22)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-primary/80">
              {isComplete ? "Generation Complete" : "Generating Chapters"}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {plan.repo_intelligence.repo_name}
            </h2>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">
              {readyCount}/{totalChapters}
            </div>
            <div className="text-[11px] text-white/36">chapters ready</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/28">
              Duration
            </div>
            <div className="mt-1 text-base font-semibold text-white">{totalDuration}</div>
          </div>
          <div className="rounded-lg bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/28">
              Scenes
            </div>
            <div className="mt-1 text-base font-semibold text-white">{totalScenes}</div>
          </div>
          <div className="rounded-lg bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/28">
              Target
            </div>
            <div className="mt-1 text-base font-semibold text-white">
              ~{plan.target_total_minutes} min
            </div>
          </div>
        </div>
      </div>

      {/* Chapter list */}
      <div className="space-y-2">
        {plan.chapters.map((ch) => (
          <ChapterRow
            key={ch.id}
            title={ch.title}
            order={ch.order}
            status={ch.status}
            durationSeconds={ch.actual_duration_seconds}
            sceneCount={ch.manifest?.scenes.length}
            error={ch.error}
          />
        ))}
      </div>

      {/* CTA */}
      {hasAnyReady && (
        <div className="flex justify-center pt-2">
          <Button
            onClick={onGoToStudio}
            className="gap-2 shadow-[0_8px_24px_rgba(104,132,255,0.2)]"
          >
            <Play className="h-4 w-4" />
            {isComplete
              ? "Open in Studio"
              : `Preview ${readyCount} Chapter${readyCount > 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
};
