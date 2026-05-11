import { useMemo, useCallback } from "react";
import {
  Play,
  CheckCircle2,
  Clock,
  ChevronRight,
  ListMusic,
} from "lucide-react";
import type { ChapterManifest, VideoManifest } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChapterTick {
  chapter_id: string;
  start_seconds: number;
  title: string;
}

interface Props {
  chapters: ChapterManifest[];
  masterIndex?: {
    title: string;
    total_chapters: number;
    total_duration_seconds: number;
    chapter_ticks: ChapterTick[];
  } | null;
  currentFrame: number;
  fps: number;
  onSeekToChapter: (chapterIndex: number, frame: number) => void;
  activeChapterIndex: number;
}

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const ChapterPlaylist = ({
  chapters,
  masterIndex,
  currentFrame,
  fps,
  onSeekToChapter,
  activeChapterIndex,
}: Props) => {
  const readyChapters = useMemo(
    () => chapters.filter((ch) => ch.status === "ready" && ch.manifest),
    [chapters]
  );

  const chapterFrameStarts = useMemo(() => {
    let cursor = 0;
    return readyChapters.map((ch) => {
      const start = cursor;
      const duration =
        ch.manifest?.scenes.reduce(
          (sum, s) => sum + (s.duration_seconds || 15),
          0
        ) ?? 0;
      cursor += duration * fps;
      return { chapterId: ch.id, startFrame: start, endFrame: cursor };
    });
  }, [readyChapters, fps]);

  const handleChapterClick = useCallback(
    (index: number) => {
      const frames = chapterFrameStarts[index];
      if (frames) {
        onSeekToChapter(index, frames.startFrame);
      }
    },
    [chapterFrameStarts, onSeekToChapter]
  );

  const totalDuration = masterIndex?.total_duration_seconds ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <ListMusic className="h-4 w-4 text-primary/60" />
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/34">
            Chapters
          </div>
        </div>
        {totalDuration > 0 && (
          <div className="mt-1 text-sm text-white/48">
            {readyChapters.length} chapters &bull; {formatDuration(totalDuration)}
          </div>
        )}
      </div>

      {/* Chapter timeline bar */}
      {chapterFrameStarts.length > 1 && (
        <div className="px-4 py-2">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            {chapterFrameStarts.map((cf, i) => {
              const widthPct =
                ((cf.endFrame - cf.startFrame) /
                  (chapterFrameStarts[chapterFrameStarts.length - 1]?.endFrame || 1)) *
                100;
              const isActive = i === activeChapterIndex;
              const isPast = i < activeChapterIndex;
              return (
                <button
                  key={cf.chapterId}
                  type="button"
                  onClick={() => handleChapterClick(i)}
                  className={cn(
                    "h-full transition-all hover:opacity-80",
                    isActive
                      ? "bg-primary"
                      : isPast
                        ? "bg-primary/40"
                        : "bg-white/[0.08]"
                  )}
                  style={{ width: `${widthPct}%` }}
                  title={readyChapters[i]?.title}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Chapter list */}
      <div className="flex-1 overflow-y-auto">
        {readyChapters.map((ch, i) => {
          const isActive = i === activeChapterIndex;
          const isPast = i < activeChapterIndex;
          const duration = ch.actual_duration_seconds ?? 0;
          const sceneCount = ch.manifest?.scenes.length ?? 0;

          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleChapterClick(i)}
              className={cn(
                "w-full px-4 py-3 text-left transition-all border-b border-white/[0.03]",
                isActive
                  ? "bg-primary/8"
                  : "hover:bg-white/[0.03]"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold shrink-0",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isPast
                        ? "bg-primary/14 text-primary"
                        : "bg-white/[0.06] text-white/28"
                  )}
                >
                  {isPast ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : isActive ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-sm font-medium truncate",
                      isActive ? "text-primary" : "text-white/64"
                    )}
                  >
                    {ch.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-white/28">
                      {sceneCount} scenes
                    </span>
                    <span className="text-[10px] text-white/20">&bull;</span>
                    <span className="text-[10px] text-white/28">
                      {formatDuration(duration)}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition",
                    isActive ? "text-primary/60" : "text-white/12"
                  )}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
