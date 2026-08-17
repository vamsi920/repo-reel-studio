import { useEffect, useMemo, useState, type ElementType } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowRight, Bot, Brain, FileCode2, Network, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectJourney } from "@/components/journey/ProjectJourney";
import type { Project } from "@/lib/db";
import { getProjectMemory, subscribeProjectMemory, type ProjectMemoryEntry } from "@/lib/projectMemory";
import type { GitNexusGraphData, VideoManifest } from "@/lib/types";

type OverviewDestination = "video" | "graph" | "ask" | "runs" | "sme" | "memory";

function Metric({ icon: Icon, label, value, detail }: { icon: ElementType; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl bg-muted/75 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

export function StudioOverview({
  project,
  projectId,
  manifest,
  graphData,
  repoContent,
  repoLabel,
  onNavigate,
}: {
  project: Project | null;
  projectId: string | null;
  manifest: VideoManifest | null;
  graphData: GitNexusGraphData | null;
  repoContent: string;
  repoLabel: string;
  onNavigate: (destination: OverviewDestination) => void;
}) {
  const [memory, setMemory] = useState<ProjectMemoryEntry[]>([]);
  const memoryProjectId = project?.id || projectId;

  useEffect(() => {
    if (!memoryProjectId) {
      setMemory([]);
      return;
    }
    setMemory(getProjectMemory(memoryProjectId));
    return subscribeProjectMemory(memoryProjectId, setMemory);
  }, [memoryProjectId]);

  const agentEvents = useMemo(() => memory.filter((entry) => entry.source === "agent-ops" || entry.source === "proactive"), [memory]);
  const pinned = memory.filter((entry) => entry.pinned).length;
  const files =
    project?.ingestion_stats?.includedFiles ||
    project?.manifest?.repo_files?.length ||
    manifest?.repo_files?.length ||
    (repoContent ? repoContent.split("\n").filter(Boolean).length : 0);
  const graphNodes = project?.graph_node_count || project?.graph_data?.nodes?.length || graphData?.nodes?.length || 0;
  const scenes = project?.manifest?.scenes?.length || manifest?.scenes?.length || 0;
  const nextDestination: OverviewDestination = agentEvents.length > 0 ? "runs" : scenes > 0 ? "video" : "graph";
  const nextTitle = agentEvents.length > 0 ? "Review agent activity" : scenes > 0 ? "Watch the repository walkthrough" : "Inspect the code graph";

  return (
    <section className="space-y-4" aria-labelledby="studio-overview-title">
      <div className="gf-panel overflow-hidden rounded-2xl">
        <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
          <div>
            <div className="text-sm font-medium text-primary">Project command center</div>
            <h1 id="studio-overview-title" className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
              Understand {repoLabel}, then put agents to work.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              One saved workspace holds the walkthrough, code evidence, questions, agent runs, SME checks, and shared memory.
            </p>
          </div>
          <div className="rounded-xl bg-foreground p-5 text-background">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-background/55">Recommended next</div>
            <div className="mt-2 text-lg font-semibold">{nextTitle}</div>
            <p className="mt-1 text-xs leading-5 text-background/65">Continue from the strongest available project context.</p>
            <Button className="mt-4 bg-background text-foreground hover:bg-background/90" onClick={() => onNavigate(nextDestination)}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {project ? <ProjectJourney project={project} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={FileCode2} label="Repository" value={files.toLocaleString()} detail="files indexed" />
        <Metric icon={Network} label="Code graph" value={graphNodes.toLocaleString()} detail="connected symbols" />
        <Metric icon={Play} label="Walkthrough" value={scenes.toLocaleString()} detail="narrated scenes" />
        <Metric icon={Brain} label="Memory" value={memory.length.toLocaleString()} detail={`${pinned} pinned for agents`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="gf-panel rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Recent project activity</div>
              <p className="mt-1 text-xs text-muted-foreground">What the workspace and its agents learned most recently.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("memory")}>Open memory</Button>
          </div>
          {memory.length === 0 ? (
            <div className="mt-4 rounded-xl bg-muted px-5 py-10 text-center text-sm text-muted-foreground">Activity appears here as you use the workspace.</div>
          ) : (
            <ol className="mt-4 divide-y divide-border/80">
              {[...memory].reverse().slice(0, 6).map((entry) => (
                <li key={entry.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-5 text-foreground/85">{entry.content}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{entry.source} · {formatDistanceToNowStrict(new Date(entry.created_at), { addSuffix: true })}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="gf-panel rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-primary" />Agent workspace</div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Run bounded tasks against repository evidence. Review every result before promotion.</p>
          <div className="mt-4 rounded-xl bg-muted p-4">
            <div className="text-2xl font-semibold tabular-nums">{agentEvents.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">agent events recorded</div>
          </div>
          <div className="mt-3 grid gap-2">
            <Button onClick={() => onNavigate("runs")}><Sparkles className="h-4 w-4" />Open Agent Ops</Button>
            <Button variant="outline" onClick={() => onNavigate("ask")}>Ask about the repository</Button>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default StudioOverview;
