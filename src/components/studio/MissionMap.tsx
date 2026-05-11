import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  FileCode2,
  FlaskConical,
  GitBranch,
  GitPullRequest,
  Loader2,
  Search,
  Shield,
  Target,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentRunTimelineEvent, AgentRun } from "@/lib/agentRuns";

// ─── Stage definitions ─────────────────────────────────────────────

interface StageDefinition {
  id: string;
  label: string;
  icon: React.ElementType;
  kinds: string[];
  color: string;
  glowColor: string;
}

const STAGES: StageDefinition[] = [
  {
    id: "prepare",
    label: "Prepare",
    icon: Shield,
    kinds: ["queued", "preparing", "workspace", "prepare.start", "prepare.cache", "prepare.done", "prepare.env_build"],
    color: "text-blue-400",
    glowColor: "shadow-blue-500/20",
  },
  {
    id: "reproduce",
    label: "Reproduce",
    icon: Target,
    kinds: ["repro.start", "repro.install", "repro.test", "repro.done"],
    color: "text-amber-400",
    glowColor: "shadow-amber-500/20",
  },
  {
    id: "diagnose",
    label: "Diagnose",
    icon: Search,
    kinds: ["diagnose.start", "diagnose.done", "diagnose.hypothesis", "issue", "plan", "running"],
    color: "text-purple-400",
    glowColor: "shadow-purple-500/20",
  },
  {
    id: "patch",
    label: "Patch",
    icon: Code2,
    kinds: ["patch", "patch.start", "patch.done", "patch.failed", "execute.command", "execute.edit", "execute.think", "critique"],
    color: "text-cyan-400",
    glowColor: "shadow-cyan-500/20",
  },
  {
    id: "validate",
    label: "Validate",
    icon: FlaskConical,
    kinds: ["validating", "validate.start", "validate.done", "policy", "policy_warning"],
    color: "text-emerald-400",
    glowColor: "shadow-emerald-500/20",
  },
  {
    id: "pr",
    label: "PR Draft",
    icon: GitPullRequest,
    kinds: ["review", "pr.start", "pr.commit", "pr.done", "pr.manual", "approved", "rejected"],
    color: "text-pink-400",
    glowColor: "shadow-pink-500/20",
  },
];

function classifyEvent(event: AgentRunTimelineEvent): string {
  for (const stage of STAGES) {
    if (stage.kinds.includes(event.kind)) return stage.id;
  }
  if (event.kind.startsWith("prepare")) return "prepare";
  if (event.kind.startsWith("repro")) return "reproduce";
  if (event.kind.startsWith("diagnose")) return "diagnose";
  if (event.kind.startsWith("patch") || event.kind.startsWith("execute")) return "patch";
  if (event.kind.startsWith("validate")) return "validate";
  if (event.kind.startsWith("pr") || event.kind.startsWith("review")) return "pr";
  return "prepare";
}

function getStageStatus(
  stageId: string,
  events: AgentRunTimelineEvent[],
  runStatus: string,
): "idle" | "running" | "passed" | "failed" {
  const stageEvents = events.filter((e) => classifyEvent(e) === stageId);
  if (stageEvents.length === 0) return "idle";

  const hasError = stageEvents.some((e) => e.level === "error");
  if (hasError) return "failed";

  const stageIdx = STAGES.findIndex((s) => s.id === stageId);
  const lastEventStage = events.length > 0
    ? STAGES.findIndex((s) => s.id === classifyEvent(events[events.length - 1]))
    : -1;

  if (lastEventStage > stageIdx) return "passed";
  if (lastEventStage === stageIdx) {
    if (["awaiting_review", "approved", "rejected", "failed", "cancelled"].includes(runStatus)) {
      return hasError ? "failed" : "passed";
    }
    return "running";
  }
  return "idle";
}

// ─── Components ────────────────────────────────────────────────────

interface MissionMapProps {
  run: AgentRun;
  onEventClick?: (event: AgentRunTimelineEvent) => void;
}

export function MissionMap({ run, onEventClick }: MissionMapProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const stageData = useMemo(() => {
    return STAGES.map((stage) => {
      const events = run.timeline.filter((e) => classifyEvent(e) === stage.id);
      const status = getStageStatus(stage.id, run.timeline, run.status);
      return { ...stage, events, status };
    });
  }, [run.timeline, run.status]);

  const activeStageIdx = useMemo(() => {
    for (let i = stageData.length - 1; i >= 0; i--) {
      if (stageData[i].status !== "idle") return i;
    }
    return 0;
  }, [stageData]);

  const totalDuration = useMemo(() => {
    if (!run.startedAt) return null;
    const start = new Date(run.startedAt).getTime();
    const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
    return end - start;
  }, [run.startedAt, run.completedAt]);

  return (
    <div ref={mapRef} className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-white/80">Mission Map</span>
        </div>
        {totalDuration && (
          <div className="flex items-center gap-1.5 text-xs text-white/40">
            <Clock className="h-3 w-3" />
            {formatDuration(totalDuration)}
          </div>
        )}
      </div>

      {/* DAG Pipeline */}
      <div className="relative">
        {/* Connection line */}
        <div className="absolute left-[23px] top-0 bottom-0 w-px bg-gradient-to-b from-blue-500/30 via-purple-500/30 to-pink-500/30" />

        {stageData.map((stage, idx) => (
          <StageNode
            key={stage.id}
            stage={stage}
            isActive={idx === activeStageIdx}
            isExpanded={expandedStage === stage.id}
            onToggle={() =>
              setExpandedStage((prev) => (prev === stage.id ? null : stage.id))
            }
            selectedEvent={selectedEvent}
            onEventSelect={(eventId) => {
              setSelectedEvent(eventId);
              const event = stage.events.find((e) => e.id === eventId);
              if (event && onEventClick) onEventClick(event);
            }}
            isLast={idx === stageData.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ─── StageNode ─────────────────────────────────────────────────────

interface StageNodeProps {
  stage: StageDefinition & {
    events: AgentRunTimelineEvent[];
    status: "idle" | "running" | "passed" | "failed";
  };
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  selectedEvent: string | null;
  onEventSelect: (eventId: string) => void;
  isLast: boolean;
}

function StageNode({
  stage,
  isActive,
  isExpanded,
  onToggle,
  selectedEvent,
  onEventSelect,
  isLast,
}: StageNodeProps) {
  const Icon = stage.icon;
  const hasEvents = stage.events.length > 0;

  return (
    <div className={cn("relative pb-3", isLast && "pb-0")}>
      {/* Stage header */}
      <button
        onClick={onToggle}
        className={cn(
          "relative z-10 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-all duration-200",
          "hover:bg-white/[0.04]",
          isActive && "bg-white/[0.06]",
          isExpanded && "bg-white/[0.05]",
        )}
      >
        {/* Node circle */}
        <div
          className={cn(
            "relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition-all duration-300",
            stage.status === "idle" && "border-white/10 bg-white/[0.03]",
            stage.status === "running" && `border-white/20 bg-white/[0.08] ${stage.glowColor} shadow-lg`,
            stage.status === "passed" && "border-emerald-500/30 bg-emerald-500/10",
            stage.status === "failed" && "border-red-500/30 bg-red-500/10",
          )}
        >
          {stage.status === "running" ? (
            <Loader2 className={cn("h-4 w-4 animate-spin", stage.color)} />
          ) : stage.status === "passed" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : stage.status === "failed" ? (
            <XCircle className="h-4 w-4 text-red-400" />
          ) : (
            <Icon className={cn("h-4 w-4", stage.status === "idle" ? "text-white/20" : stage.color)} />
          )}

          {/* Pulse ring for active */}
          {stage.status === "running" && (
            <span className="absolute inset-0 animate-ping rounded-full border border-white/10" />
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                stage.status === "idle" ? "text-white/30" : "text-white/80",
              )}
            >
              {stage.label}
            </span>
            {hasEvents && (
              <span className="text-[10px] text-white/30 tabular-nums">
                {stage.events.length}
              </span>
            )}
          </div>
          {stage.events.length > 0 && (
            <p className="text-xs text-white/40 truncate mt-0.5">
              {stage.events[stage.events.length - 1].title}
            </p>
          )}
        </div>

        {/* Expand indicator */}
        {hasEvents && (
          <div className="shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-white/30" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-white/30" />
            )}
          </div>
        )}
      </button>

      {/* Expanded events */}
      {isExpanded && hasEvents && (
        <div className="ml-[23px] pl-6 border-l border-white/[0.06] mt-1 space-y-0.5">
          {stage.events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              stageColor={stage.color}
              isSelected={selectedEvent === event.id}
              onSelect={() => onEventSelect(event.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EventRow ──────────────────────────────────────────────────────

interface EventRowProps {
  event: AgentRunTimelineEvent;
  stageColor: string;
  isSelected: boolean;
  onSelect: () => void;
}

function EventRow({ event, stageColor, isSelected, onSelect }: EventRowProps) {
  const time = useMemo(() => {
    try {
      return new Date(event.at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "";
    }
  }, [event.at]);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-150",
        "hover:bg-white/[0.04]",
        isSelected && "bg-white/[0.06] ring-1 ring-white/[0.08]",
      )}
    >
      {/* Dot */}
      <div
        className={cn(
          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
          event.level === "error" ? "bg-red-400" : event.level === "warning" ? "bg-amber-400" : "bg-white/20",
        )}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/70 truncate">
            {event.title}
          </span>
          <span className="text-[10px] text-white/25 tabular-nums shrink-0">{time}</span>
        </div>
        {event.detail && (
          <p className="text-[11px] text-white/35 mt-0.5 line-clamp-2 leading-relaxed">
            {event.detail}
          </p>
        )}
      </div>

      {/* Level badge */}
      {event.level !== "info" && (
        <span
          className={cn(
            "mt-1 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
            event.level === "error" && "bg-red-500/10 text-red-400",
            event.level === "warning" && "bg-amber-500/10 text-amber-400",
          )}
        >
          {event.level}
        </span>
      )}
    </button>
  );
}

// ─── Event Detail Panel ────────────────────────────────────────────

interface EventDetailPanelProps {
  event: AgentRunTimelineEvent;
  run: AgentRun;
  onClose: () => void;
}

export function EventDetailPanel({ event, run, onClose }: EventDetailPanelProps) {
  const relatedArtifacts = useMemo(() => {
    const paths = run.artifacts?.artifactPaths || {};
    const kind = event.kind.toLowerCase();
    const related: { label: string; path: string }[] = [];

    if (kind.includes("patch") || kind.includes("diff")) {
      if (paths.patchDiff) related.push({ label: "Patch", path: paths.patchDiff });
      if (paths.diffStat) related.push({ label: "Diff Stats", path: paths.diffStat });
    }
    if (kind.includes("valid") || kind.includes("test")) {
      if (paths.validationReport) related.push({ label: "Validation", path: paths.validationReport });
    }
    if (kind.includes("pr") || kind.includes("review")) {
      if (paths.prDraft) related.push({ label: "PR Draft", path: paths.prDraft });
    }

    return related;
  }, [event, run]);

  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              event.level === "error" ? "bg-red-400" : event.level === "warning" ? "bg-amber-400" : "bg-emerald-400",
            )}
          />
          <span className="text-sm font-semibold text-white">{event.title}</span>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs">
          Close
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-4 text-xs text-white/40">
          <span className="font-mono">{event.kind}</span>
          <span>{new Date(event.at).toLocaleString()}</span>
        </div>

        {event.detail && (
          <div className="rounded-lg bg-black/30 p-3">
            <pre className="text-xs text-white/60 whitespace-pre-wrap font-mono leading-relaxed">
              {event.detail}
            </pre>
          </div>
        )}

        {relatedArtifacts.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06]">
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">
              Related Artifacts
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {relatedArtifacts.map((artifact) => (
                <span
                  key={artifact.label}
                  className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-white/50"
                >
                  <FileCode2 className="inline h-3 w-3 mr-1 -mt-0.5" />
                  {artifact.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
