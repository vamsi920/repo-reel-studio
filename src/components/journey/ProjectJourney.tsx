// Project journey — the connective tissue of the whole product story.
//
// One strip that shows where a project stands in the delivery lifecycle:
//   Blueprint → Onboard → Understand → Build → Operate
// Every stage links to the surface that owns it, so any user can walk the
// story from requirements engineering to production support.

import { useNavigate } from "react-router-dom";
import {
  Lightbulb,
  FolderGit2,
  PlaySquare,
  Bot,
  Radar,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/db";
import { getProjectSourceType } from "@/lib/projectSource";
import { getProjectMemory } from "@/lib/projectMemory";

export type JourneyStageId =
  | "blueprint"
  | "onboard"
  | "understand"
  | "build"
  | "operate";

export type JourneyStageState = "done" | "current" | "upcoming";

export interface JourneyStage {
  id: JourneyStageId;
  label: string;
  description: string;
  state: JourneyStageState;
  icon: typeof Lightbulb;
  /** Where clicking the stage takes the user. */
  href: string | null;
}

export function computeJourneyStages(project: Project): JourneyStage[] {
  const sourceType = getProjectSourceType(project.repo_url);
  const isScratch = sourceType === "scratch";
  const memory = getProjectMemory(project.id);
  const hasBlueprint =
    isScratch || memory.some((entry) => entry.kind === "requirement");
  const hasIngested = Boolean(
    project.phase1_completed_at || project.repo_content || project.manifest
  );
  const hasManifest = Boolean(
    project.manifest && project.status === "ready"
  );
  const hasAgentActivity = memory.some(
    (entry) => entry.source === "agent-ops" || entry.source === "proactive"
  );

  const studioBase = `/studio?project=${project.id}`;

  const stages: JourneyStage[] = [
    {
      id: "blueprint",
      label: "Blueprint",
      description: hasBlueprint
        ? "Requirements captured in project memory"
        : "Capture requirements (from-scratch projects start here)",
      state: hasBlueprint ? "done" : hasIngested ? "done" : "current",
      icon: Lightbulb,
      href: hasManifest ? `${studioBase}&view=memory` : null,
    },
    {
      id: "onboard",
      label: "Onboard",
      description: hasIngested
        ? "Source ingested and analyzed"
        : isScratch
          ? "Attach a repository or folder when the build starts"
          : "Ingest and analyze the source",
      state: hasIngested ? "done" : "current",
      icon: FolderGit2,
      href: hasIngested ? null : `/processing?project=${project.id}`,
    },
    {
      id: "understand",
      label: "Understand",
      description: hasManifest
        ? "Walkthrough video, code graph, and Repo Q&A are live"
        : "Generate the walkthrough to unlock this stage",
      state: hasManifest ? "done" : hasIngested ? "current" : "upcoming",
      icon: PlaySquare,
      href: hasManifest ? `${studioBase}&view=video` : null,
    },
    {
      id: "build",
      label: "Build",
      description: hasAgentActivity
        ? "Agent runs in flight — sandboxed fixes and features"
        : "Launch issue-bound agent runs from Agent Ops",
      state: hasAgentActivity ? "done" : hasManifest ? "current" : "upcoming",
      icon: Bot,
      href: hasManifest ? `${studioBase}&view=runs` : null,
    },
    {
      id: "operate",
      label: "Operate",
      description:
        "Proactive discovery watches the repo and drafts fixes for review",
      state: hasAgentActivity ? "current" : "upcoming",
      icon: Radar,
      href: hasManifest ? `${studioBase}&view=runs` : null,
    },
  ];

  return stages;
}

export function ProjectJourney({
  project,
  compact = false,
  className,
}: {
  project: Project;
  compact?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const stages = computeJourneyStages(project);

  return (
    <div
      data-testid="project-journey"
      className={cn(
        "rounded-[20px] gf-panel-soft p-4",
        compact && "p-3",
        className
      )}
    >
      {!compact && (
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Project journey — requirements to production
        </div>
      )}
      <ol className={cn("flex flex-wrap items-stretch gap-2", compact && "gap-1.5")}>
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const clickable = Boolean(stage.href);
          return (
            <li key={stage.id} className="flex min-w-0 flex-1 basis-[110px]">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => stage.href && navigate(stage.href)}
                title={stage.description}
                className={cn(
                  "flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-all",
                  stage.state === "done" &&
                    "border-emerald-300/30 bg-emerald-300/8 text-emerald-700",
                  stage.state === "current" &&
                    "border-primary/30 bg-primary/8 text-primary",
                  stage.state === "upcoming" &&
                    "border-border bg-muted text-muted-foreground",
                  clickable
                    ? "cursor-pointer hover:opacity-80"
                    : "cursor-default"
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  {stage.state === "done" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        stage.state === "current" && "animate-pulse"
                      )}
                    />
                  )}
                  <span className="mr-1 opacity-60">{index + 1}</span>
                  {stage.label}
                </span>
                {!compact && (
                  <span className="line-clamp-2 text-[11px] leading-4 opacity-80">
                    {stage.description}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default ProjectJourney;
