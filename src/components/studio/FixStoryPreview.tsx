import { useMemo, useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Clock,
  FileCode2,
  FlaskConical,
  GitPullRequest,
  Search,
  Target,
  Zap,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentRun } from "@/lib/agentRuns";
import {
  generateFixStoryManifest,
  formatFixStoryDuration,
  type FixStoryManifest,
  type FixStoryScene,
} from "@/lib/fixStoryVideo";

const SCENE_ICONS: Record<FixStoryScene["type"], React.ElementType> = {
  intro: Zap,
  bug_context: Target,
  root_cause: Search,
  diff_walkthrough: FileCode2,
  test_results: FlaskConical,
  summary: GitPullRequest,
};

const SCENE_COLORS: Record<FixStoryScene["type"], string> = {
  intro: "text-purple-400",
  bug_context: "text-red-400",
  root_cause: "text-amber-400",
  diff_walkthrough: "text-cyan-400",
  test_results: "text-emerald-400",
  summary: "text-pink-400",
};

interface FixStoryPreviewProps {
  run: AgentRun;
}

export function FixStoryPreview({ run }: FixStoryPreviewProps) {
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const manifest = useMemo<FixStoryManifest | null>(() => {
    if (!run.artifacts?.patch) return null;
    try {
      return generateFixStoryManifest(run);
    } catch {
      return null;
    }
  }, [run]);

  if (!manifest) {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6 text-center">
        <Film className="h-8 w-8 text-white/20 mx-auto mb-3" />
        <p className="text-sm text-white/40">
          Fix Story will be available after the run completes with a patch.
        </p>
      </div>
    );
  }

  const currentScene = manifest.scenes[currentSceneIdx];
  const progress = ((currentSceneIdx + 1) / manifest.scenes.length) * 100;

  return (
    <div className="space-y-4">
      {/* Video player area */}
      <div className="relative overflow-hidden rounded-2xl bg-black/40 border border-white/[0.08]">
        {/* Scene visual */}
        <div
          className={cn(
            "relative min-h-[280px] flex flex-col items-center justify-center p-8 transition-all duration-500",
            currentScene.visualConfig.background === "gradient" &&
              "bg-gradient-to-br from-purple-900/30 via-black to-cyan-900/20",
            currentScene.visualConfig.background === "mesh" &&
              "bg-gradient-to-br from-amber-900/20 via-black to-purple-900/20",
            currentScene.visualConfig.background === "dark" && "bg-black/60",
          )}
        >
          {/* Scene indicator */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
              Scene {currentSceneIdx + 1} / {manifest.scenes.length}
            </span>
          </div>

          <div className="absolute top-4 right-4 flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-white/30" />
            <span className="text-[10px] text-white/30 tabular-nums">
              {currentScene.durationSeconds}s
            </span>
          </div>

          {/* Scene content */}
          <div className="text-center max-w-lg mx-auto space-y-4">
            {(() => {
              const Icon = SCENE_ICONS[currentScene.type];
              const color = SCENE_COLORS[currentScene.type];
              return (
                <div
                  className={cn(
                    "inline-flex h-12 w-12 items-center justify-center rounded-full",
                    "bg-white/[0.06] border border-white/[0.08]",
                  )}
                >
                  <Icon className={cn("h-5 w-5", color)} />
                </div>
              );
            })()}

            <h3 className="text-lg font-semibold text-white">{currentScene.title}</h3>
            <p className="text-sm text-white/50 leading-relaxed">{currentScene.narration}</p>

            {/* Scene-specific data */}
            {currentScene.type === "diff_walkthrough" && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Stat label="Files" value={String((currentScene.data.changedFiles as any[])?.length || 0)} />
                <Stat label="Added" value={`+${currentScene.data.totalAdditions}`} color="text-emerald-400" />
                <Stat label="Removed" value={`-${currentScene.data.totalDeletions}`} color="text-red-400" />
              </div>
            )}

            {currentScene.type === "test_results" && (
              <div className="mt-4 flex items-center justify-center gap-4">
                <Stat
                  label="Status"
                  value={String(currentScene.data.overallStatus)}
                  color={currentScene.data.overallStatus === "passed" ? "text-emerald-400" : "text-amber-400"}
                />
                <Stat
                  label="Pass Rate"
                  value={`${Math.round((currentScene.data.passRate as number || 0) * 100)}%`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/40">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentSceneIdx(Math.max(0, currentSceneIdx - 1))}
              disabled={currentSceneIdx === 0}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] disabled:opacity-30 transition"
            >
              <SkipBack className="h-4 w-4 text-white/60" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-full bg-white/[0.08] hover:bg-white/[0.12] transition"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 text-white" />
              ) : (
                <Play className="h-4 w-4 text-white ml-0.5" />
              )}
            </button>

            <button
              onClick={() =>
                setCurrentSceneIdx(Math.min(manifest.scenes.length - 1, currentSceneIdx + 1))
              }
              disabled={currentSceneIdx === manifest.scenes.length - 1}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] disabled:opacity-30 transition"
            >
              <SkipForward className="h-4 w-4 text-white/60" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-white/40">
            <span className="font-mono tabular-nums">{formatFixStoryDuration(manifest)}</span>
            <span>
              {manifest.metadata.filesChanged} files · {manifest.metadata.linesChanged} lines
            </span>
          </div>
        </div>
      </div>

      {/* Scene list */}
      <div className="space-y-1">
        {manifest.scenes.map((scene, idx) => {
          const Icon = SCENE_ICONS[scene.type];
          const color = SCENE_COLORS[scene.type];
          const isCurrent = idx === currentSceneIdx;

          return (
            <button
              key={scene.id}
              onClick={() => setCurrentSceneIdx(idx)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150",
                "hover:bg-white/[0.04]",
                isCurrent && "bg-white/[0.06] ring-1 ring-white/[0.08]",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  isCurrent ? "bg-white/[0.08]" : "bg-white/[0.03]",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isCurrent ? color : "text-white/20")} />
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "text-xs font-medium",
                    isCurrent ? "text-white/80" : "text-white/40",
                  )}
                >
                  {scene.title}
                </span>
              </div>
              <span className="text-[10px] text-white/25 tabular-nums shrink-0">
                {scene.durationSeconds}s
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "text-white/70",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="text-center">
      <div className={cn("text-base font-semibold tabular-nums", color)}>{value}</div>
      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
