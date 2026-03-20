import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCode2,
  FlaskConical,
  GitBranch,
  GitPullRequest,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  approveAgentRun,
  cancelAgentRun,
  createAgentRun,
  type AgentRun,
  type AgentRunContextHints,
  type AgentRunStatus,
  getAgentRun,
  listAgentRuns,
  rejectAgentRun,
} from "@/lib/agentRuns";
import type { GitNexusGraphData, VideoManifest } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AgentRunsPanelProps {
  repoUrl: string;
  repoName: string;
  projectId?: string | null;
  manifest: VideoManifest | null;
  graphData: GitNexusGraphData | null;
  onFocusFile?: (filePath: string) => void;
}

const ACTIVE_STATUSES: AgentRunStatus[] = ["queued", "preparing", "running", "validating"];

const STATUS_ORDER: Partial<Record<AgentRunStatus, number>> = {
  queued: 0,
  preparing: 1,
  running: 2,
  validating: 3,
  awaiting_review: 4,
  approved: 5,
  rejected: 5,
  failed: 5,
  cancelled: 5,
  expired: 5,
};

const STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: "Queued",
  preparing: "Preparing",
  running: "Running",
  validating: "Validating",
  awaiting_review: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

const PIPELINE = [
  { id: "preparing" as const, label: "Prepare" },
  { id: "running" as const, label: "Patch" },
  { id: "validating" as const, label: "Validate" },
  { id: "awaiting_review" as const, label: "Review" },
];

const STATUS_ACCENTS: Record<AgentRunStatus, string> = {
  queued: "bg-white/[0.06] text-white/60",
  preparing: "bg-amber-300/12 text-amber-100",
  running: "bg-sky-300/12 text-sky-100",
  validating: "bg-violet-300/12 text-violet-100",
  awaiting_review: "bg-amber-300/12 text-amber-100",
  approved: "bg-emerald-300/12 text-emerald-100",
  rejected: "bg-rose-300/12 text-rose-100",
  failed: "bg-rose-300/12 text-rose-100",
  expired: "bg-white/[0.06] text-white/50",
  cancelled: "bg-white/[0.06] text-white/50",
};

type DetailTab = "overview" | "diff" | "validation" | "pr";

function extractGitHubRepoKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("github.com")) return null;
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    return owner && repo ? `${owner}/${repo.replace(/\.git$/i, "")}`.toLowerCase() : null;
  } catch {
    return null;
  }
}

function fmtTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtRelative(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const diffMs = Date.now() - date.valueOf();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function buildContextHints(
  manifest: VideoManifest | null,
  graphData: GitNexusGraphData | null,
): AgentRunContextHints {
  const focusFiles = Array.from(
    new Set(
      [
        ...(manifest?.scenes.map((scene) => scene.file_path) ?? []),
        ...(manifest?.evidence_bundle?.important_files ?? []),
      ].filter(Boolean),
    ),
  ).slice(0, 10);

  const hubFiles = Array.from(
    new Set(
      [
        ...(manifest?.evidence_bundle?.hub_files ?? []),
        ...(graphData?.summary?.hubFiles ?? []),
      ].filter(Boolean),
    ),
  ).slice(0, 8);

  const entryFiles = Array.from(
    new Set(
      [
        ...(manifest?.evidence_bundle?.entry_candidates ?? []),
        ...(graphData?.summary?.entryPoints ?? []),
      ].filter(Boolean),
    ),
  ).slice(0, 6);

  const technologies = Array.from(
    new Set(
      [
        ...(manifest?.evidence_bundle?.repo_stats?.key_technologies ?? []),
        ...(graphData?.summary?.keyTechnologies ?? []),
      ].filter(Boolean),
    ),
  ).slice(0, 8);

  return {
    focusFiles,
    hubFiles,
    entryFiles,
    technologies,
    architecture:
      manifest?.knowledge_graph?.summary.architecture ??
      graphData?.summary?.architecturePattern ??
      null,
    evidenceCount: manifest?.evidence_bundle?.snippet_catalog.length ?? 0,
    snippetCount: manifest?.evidence_bundle?.snippet_catalog.length ?? 0,
  };
}

export default function AgentRunsPanel({
  repoUrl,
  repoName,
  projectId,
  manifest,
  graphData,
  onFocusFile,
}: AgentRunsPanelProps) {
  const [issueUrl, setIssueUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [approveBranch, setApproveBranch] = useState("");
  const [runFilter, setRunFilter] = useState("");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | "cancel" | "retry" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [showBranchField, setShowBranchField] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const contextHints = useMemo(() => buildContextHints(manifest, graphData), [manifest, graphData]);
  const repoKey = useMemo(() => extractGitHubRepoKey(repoUrl), [repoUrl]);
  const isGitHub = useMemo(() => {
    try {
      return new URL(repoUrl).hostname.includes("github.com");
    } catch {
      return false;
    }
  }, [repoUrl]);

  const loadRuns = useCallback(
    async (preferredId?: string | null) => {
      if (!repoUrl) return;
      setLoadingRuns(true);
      try {
        const next = await listAgentRuns({ repoUrl, projectId, limit: 24 });
        setRuns(next);
        const pick = preferredId ?? selectedId;
        if (pick && next.some((run) => run.id === pick)) setSelectedId(pick);
        else setSelectedId(next[0]?.id ?? null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load runs");
      } finally {
        setLoadingRuns(false);
      }
    },
    [projectId, repoUrl, selectedId],
  );

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const selected = useMemo(
    () => runs.find((run) => run.id === selectedId) ?? null,
    [runs, selectedId],
  );

  useEffect(() => {
    if (selected?.approval?.branchName) {
      setApproveBranch(selected.approval.branchName);
    }
  }, [selected?.approval?.branchName]);

  useEffect(() => {
    const hasActive = runs.some((run) => ACTIVE_STATUSES.includes(run.status));
    if (!hasActive) return;
    const timer = window.setInterval(() => void loadRuns(selectedId), 3200);
    return () => clearInterval(timer);
  }, [loadRuns, runs, selectedId]);

  const pendingReview = useMemo(
    () => runs.filter((run) => run.status === "awaiting_review").length,
    [runs],
  );

  const filteredRuns = useMemo(() => {
    const needle = runFilter.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((run) => {
      const haystack = [
        run.issue?.title,
        run.issue?.number ? `#${run.issue.number}` : "",
        run.id.slice(0, 8),
        STATUS_LABEL[run.status],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [runFilter, runs]);

  const startRun = useCallback(
    async (overrideUrl?: string) => {
      const url = (overrideUrl ?? issueUrl).trim();
      if (!url) {
        inputRef.current?.focus();
        return;
      }
      if (!isGitHub) {
        setError("Only GitHub-backed repositories are supported.");
        return;
      }
      const issueKey = extractGitHubRepoKey(url);
      if (repoKey && issueKey && repoKey !== issueKey) {
        setError("The issue URL must belong to the same repository currently loaded.");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const run = await createAgentRun({
          repoUrl,
          repoName,
          issueUrl: url,
          projectId,
          branch: branch.trim() || undefined,
          contextHints,
        });
        setRuns((previous) => [run, ...previous.filter((item) => item.id !== run.id)]);
        setSelectedId(run.id);
        setIssueUrl(url);
        setApproveBranch(run.approval.branchName ?? "");
        setActiveTab("overview");
        toast({ title: "Run started", description: `Tracking ${run.id.slice(0, 8)}` });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to start run");
      } finally {
        setSubmitting(false);
      }
    },
    [branch, contextHints, isGitHub, issueUrl, projectId, repoKey, repoName, repoUrl],
  );

  const refreshSelected = useCallback(async () => {
    if (!selectedId) return;
    setRefreshing(true);
    try {
      const run = await getAgentRun(selectedId);
      setRuns((previous) =>
        [run, ...previous.filter((item) => item.id !== run.id)].sort(
          (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        ),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [selectedId]);

  const approve = useCallback(async () => {
    if (!selected) return;
    setAction("approve");
    setError(null);
    try {
      const run = await approveAgentRun(selected.id, approveBranch.trim() || undefined);
      setRuns((previous) => [run, ...previous.filter((item) => item.id !== run.id)]);
      setSelectedId(run.id);
      toast({ title: "Approved", description: "Branch and PR draft are ready." });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Approval failed");
    } finally {
      setAction(null);
    }
  }, [approveBranch, selected]);

  const reject = useCallback(async () => {
    if (!selected) return;
    setAction("reject");
    setError(null);
    try {
      const run = await rejectAgentRun(selected.id);
      setRuns((previous) => [run, ...previous.filter((item) => item.id !== run.id)]);
      setSelectedId(run.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Rejection failed");
    } finally {
      setAction(null);
    }
  }, [selected]);

  const cancel = useCallback(async () => {
    if (!selected) return;
    setAction("cancel");
    setError(null);
    try {
      const run = await cancelAgentRun(selected.id);
      setRuns((previous) => [run, ...previous.filter((item) => item.id !== run.id)]);
      setSelectedId(run.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Cancel failed");
    } finally {
      setAction(null);
    }
  }, [selected]);

  const retry = useCallback(async () => {
    if (!selected) return;
    setAction("retry");
    try {
      await startRun(selected.issueUrl);
    } finally {
      setAction(null);
    }
  }, [selected, startRun]);

  const phaseIndex = STATUS_ORDER[selected?.status ?? "queued"] ?? 0;
  const isActive = selected ? ACTIVE_STATUSES.includes(selected.status) : false;
  const isReview = selected?.status === "awaiting_review";
  const isFailed = selected?.status === "failed" || selected?.status === "cancelled";
  const validationNotes = selected?.artifacts.validation.notes ?? [];
  const latestEvent = selected?.timeline[selected.timeline.length - 1] ?? null;

  return (
    <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="overflow-hidden rounded-[20px] gf-panel shadow-[0_18px_44px_rgba(8,14,30,0.18)]">
          <div className="px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/34">
              Agent Ops
            </div>
            <h2 className="mt-2 text-[1.35rem] font-semibold tracking-tight text-white">
              Paste an issue URL
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/54">
              Each run stays inside this repository and returns a reviewable diff before anything is promoted.
            </p>

            <div className="mt-4 space-y-3">
              <Input
                ref={inputRef}
                value={issueUrl}
                variant="hero"
                onChange={(event) => {
                  setIssueUrl(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void startRun();
                }}
                placeholder="https://github.com/owner/repo/issues/123"
              />

              <Button
                type="button"
                size="lg"
                className="w-full justify-center"
                onClick={() => void startRun()}
                disabled={submitting || !issueUrl.trim()}
              >
                {submitting ? <Loader2 className="animate-spin" /> : <PlayCircle />}
                {submitting ? "Starting run" : "Start run"}
              </Button>
            </div>

            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/40 transition hover:text-white/68"
              onClick={() => setShowBranchField((value) => !value)}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Branch override
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showBranchField && "rotate-180")}
              />
            </button>

            {showBranchField && (
              <Input
                className="mt-3 h-9 text-sm"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="Optional branch"
              />
            )}

            {error && (
              <div className="mt-4 rounded-xl bg-rose-300/10 px-3 py-3 text-sm text-rose-100 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.16)]">
                {error}
              </div>
            )}
          </div>

          <div className="bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-white/34">
              <span>{runs.length} runs</span>
              <span>{pendingReview} review</span>
            </div>
          </div>
        </section>

        <section className="rounded-[20px] bg-[rgba(19,27,46,0.9)] p-3 shadow-[0_18px_44px_rgba(8,14,30,0.18)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/34">
                Active Runs
              </div>
              <p className="mt-1 text-sm text-white/54">Select a run to inspect its diff and validation evidence.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadRuns(selectedId)}
              disabled={loadingRuns}
              className="rounded-lg p-2 text-white/46 transition hover:bg-white/[0.05] hover:text-white"
            >
              <RefreshCw className={cn("h-4 w-4", loadingRuns && "animate-spin")} />
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" />
            <Input
              className="pl-9 text-sm"
              value={runFilter}
              onChange={(event) => setRunFilter(event.target.value)}
              placeholder="Filter runs"
            />
          </div>

          <div className="space-y-2">
            {filteredRuns.length === 0 ? (
              <div className="rounded-xl bg-white/[0.04] px-4 py-8 text-center text-sm text-white/46">
                {runs.length === 0 ? "No runs yet." : "No runs match that filter."}
              </div>
            ) : (
              filteredRuns.map((run) => (
                <RunListItem
                  key={run.id}
                  run={run}
                  isSelected={run.id === selectedId}
                  onSelect={() => setSelectedId(run.id)}
                />
              ))
            )}
          </div>
        </section>
      </aside>

      {selected ? (
        <section className="space-y-4">
          <div className="overflow-hidden rounded-[20px] gf-panel shadow-[0_18px_44px_rgba(8,14,30,0.18)]">
            <div className="px-5 py-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/34">
                    <span>{selected.issue ? `Issue #${selected.issue.number}` : "Run"}</span>
                    <span>{selected.id.slice(0, 8)}</span>
                    <span>{fmtRelative(selected.updatedAt)}</span>
                  </div>
                  <h3 className="mt-2 text-[1.9rem] font-semibold leading-tight tracking-tight text-white">
                    {selected.issue?.title ?? "Fix attempt"}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/54">
                    {selected.plan?.summary ??
                      selected.issue?.body?.trim() ??
                      "This run contains the sandbox diff, validation output, and promotion controls."}
                  </p>
                  {selected.issue?.htmlUrl && (
                    <a
                      href={selected.issue.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary transition hover:text-white"
                    >
                      View on GitHub
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex w-full shrink-0 flex-col gap-3 xl:w-auto xl:items-end">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={selected.status} />
                    <InlineMeta label="Risk" value={selected.evaluation.riskLevel} />
                    <InlineMeta label="Confidence" value={selected.evaluation.confidenceLevel} />
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => void refreshSelected()}
                      disabled={refreshing}
                    >
                      {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Refresh
                    </Button>

                    {isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 bg-amber-300/12 text-amber-100 hover:bg-amber-300/18"
                        onClick={() => void cancel()}
                        disabled={action === "cancel"}
                      >
                        {action === "cancel" ? <Loader2 className="animate-spin" /> : <Clock />}
                        Cancel
                      </Button>
                    )}

                    {(isFailed || selected.status === "rejected") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => void retry()}
                        disabled={action === "retry"}
                      >
                        {action === "retry" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                        Retry
                      </Button>
                    )}
                  </div>

                  {isReview && (
                    <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
                      <Input
                        className="h-9 min-w-[220px] text-sm"
                        value={approveBranch}
                        onChange={(event) => setApproveBranch(event.target.value)}
                        placeholder="Branch name"
                      />
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => void approve()}
                        disabled={action === "approve"}
                      >
                        {action === "approve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 bg-white/[0.04] text-white/74 hover:bg-white/[0.07]"
                        onClick={() => void reject()}
                        disabled={action === "reject"}
                      >
                        {action === "reject" ? <Loader2 className="animate-spin" /> : <XCircle />}
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white/[0.02] px-5 py-4">
              <PipelineBar
                phaseIndex={phaseIndex}
                isActive={isActive}
                status={selected.status}
                isFailed={isFailed}
                latestTitle={latestEvent?.title}
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <CompactMetric label="Files changed" value={`${selected.artifacts.changedFiles.length}`} icon={FileCode2} />
                <CompactMetric
                  label="Validation"
                  value={humanizeValidation(selected.artifacts.validation.overallStatus)}
                  icon={FlaskConical}
                />
                <CompactMetric
                  label="Last update"
                  value={fmtTime(selected.updatedAt) || "n/a"}
                  icon={Sparkles}
                />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[20px] gf-panel shadow-[0_18px_44px_rgba(8,14,30,0.18)]">
            <div className="flex flex-wrap gap-1 bg-white/[0.02] px-3 py-3">
              {([
                ["overview", "Overview"],
                ["diff", "Diff"],
                ["validation", "Validation"],
                ["pr", "PR Draft"],
              ] as Array<[DetailTab, string]>).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                    activeTab === tab
                      ? "bg-white/[0.08] text-primary"
                      : "text-white/38 hover:bg-white/[0.04] hover:text-white/74",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="px-5 py-5">
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {selected.approval.instructions.length > 0 && (
                    <div>
                      <SectionLabel title="Push Instructions" />
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-[#060e20] p-4 text-xs leading-6 text-white/78 shadow-[inset_0_0_0_1px_rgba(65,71,85,0.12)]">
                        <code>{selected.approval.instructions.join("\n")}</code>
                      </pre>
                    </div>
                  )}

                  <div>
                    <SectionLabel title="Recent Activity" />
                    <div className="mt-2 space-y-2">
                      {selected.timeline.length > 0 ? (
                        selected.timeline.map((event) => (
                          <div
                            key={event.id}
                            className={cn(
                              "rounded-xl px-4 py-3",
                              event.level === "error"
                                ? "bg-rose-300/10 text-rose-100 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.16)]"
                                : "bg-white/[0.04] text-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold">{event.title}</p>
                              <span className="text-xs text-white/34">{fmtTime(event.at)}</span>
                            </div>
                            {event.detail && (
                              <p className="mt-1 text-sm leading-6 text-white/58">{event.detail}</p>
                            )}
                          </div>
                        ))
                      ) : (
                        <EmptyState text="The run will add timeline events as it progresses." />
                      )}
                    </div>
                  </div>

                  <div>
                    <SectionLabel title="Changed Files" />
                    <div className="mt-2 space-y-2">
                      {selected.artifacts.changedFiles.length > 0 ? (
                        selected.artifacts.changedFiles.map((file) => (
                          <button
                            key={file.path}
                            type="button"
                            onClick={() => onFocusFile?.(file.path)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.06]"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">{file.path}</div>
                              <div className="mt-1 text-xs text-white/40">
                                {file.changedLines} changed line{file.changedLines === 1 ? "" : "s"}
                              </div>
                            </div>
                            <div className="shrink-0 text-xs text-white/46">
                              <span className="text-emerald-300">+{file.additions}</span>
                              {" / "}
                              <span className="text-rose-300">-{file.deletions}</span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <EmptyState text="No changed files recorded for this run." />
                      )}
                    </div>
                  </div>

                  {(selected.evaluation.riskReasons.length > 0 ||
                    selected.evaluation.confidenceReasons.length > 0) && (
                    <div>
                      <SectionLabel title="Operator Notes" />
                      <div className="mt-2 space-y-2">
                        {selected.evaluation.riskReasons.map((reason) => (
                          <SimpleNote key={`risk-${reason}`} tone="warning" text={reason} />
                        ))}
                        {selected.evaluation.confidenceReasons.map((reason) => (
                          <SimpleNote key={`confidence-${reason}`} tone="neutral" text={reason} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "diff" && (
                <div className="space-y-3">
                  {selected.artifacts.diffStat && (
                    <pre className="overflow-x-auto rounded-xl bg-white/[0.04] p-4 text-xs leading-6 text-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                      <code>{selected.artifacts.diffStat}</code>
                    </pre>
                  )}
                  <ScrollArea className="h-[520px] rounded-xl bg-[#060e20] shadow-[inset_0_0_0_1px_rgba(65,71,85,0.12)]">
                    <pre className="p-5 text-xs leading-6 text-white/80">
                      <code>{selected.artifacts.patch || "No diff available yet."}</code>
                    </pre>
                  </ScrollArea>
                </div>
              )}

              {activeTab === "validation" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <SectionLabel title="Validation Status" compact />
                    <ValidationBadge status={selected.artifacts.validation.overallStatus} />
                  </div>

                  {validationNotes.length > 0 && (
                    <div className="space-y-2">
                      {validationNotes.map((note) => (
                        <SimpleNote key={note} tone="neutral" text={note} />
                      ))}
                    </div>
                  )}

                  {selected.artifacts.validation.commands.length > 0 ? (
                    selected.artifacts.validation.commands.map((command) => (
                      <details
                        key={`${command.command}-${command.durationMs}`}
                        className="group overflow-hidden rounded-xl bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-white/[0.05]">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                              command.exitCode === 0
                                ? "bg-emerald-300/12 text-emerald-100"
                                : "bg-rose-300/12 text-rose-100",
                            )}
                          >
                            {command.exitCode === 0 ? "Pass" : "Fail"}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-sm text-white/80">
                            {command.command}
                          </span>
                          <span className="text-xs text-white/34">{command.durationMs}ms</span>
                          <ChevronDown className="h-4 w-4 text-white/34 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="grid gap-3 p-4 lg:grid-cols-2">
                          <LogBox label="stdout" content={command.stdout} />
                          <LogBox label="stderr" content={command.stderr} />
                        </div>
                      </details>
                    ))
                  ) : (
                    <EmptyState text="No validation commands captured for this run." />
                  )}
                </div>
              )}

              {activeTab === "pr" && (
                <div className="space-y-3">
                  {selected.artifacts.prDraft ? (
                    <>
                      <div className="rounded-xl bg-white/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                        <SectionLabel title="Title" compact />
                        <p className="mt-2 text-base font-semibold text-white">
                          {selected.artifacts.prDraft.title}
                        </p>
                      </div>
                      <ScrollArea className="h-[500px] rounded-xl bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                        <pre className="whitespace-pre-wrap p-5 text-sm leading-7 text-white/74">
                          <code>{selected.artifacts.prDraft.body}</code>
                        </pre>
                      </ScrollArea>
                    </>
                  ) : (
                    <EmptyState
                      text={
                        isActive
                          ? "The PR draft will appear when the run completes."
                          : "No PR draft is available for this run."
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="flex min-h-[520px] items-center justify-center rounded-[20px] gf-panel px-6 text-center shadow-[0_18px_44px_rgba(8,14,30,0.18)]">
          <div className="max-w-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05]">
              <GitPullRequest className="h-6 w-6 text-white/34" />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">No run selected</h3>
            <p className="mt-2 text-sm leading-6 text-white/52">
              Start a run from the left rail, then review the resulting diff, validation output, and promotion controls here.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function PipelineBar({
  phaseIndex,
  isActive,
  status,
  isFailed,
  latestTitle,
}: {
  phaseIndex: number;
  isActive: boolean;
  status: AgentRunStatus;
  isFailed: boolean;
  latestTitle?: string | null;
}) {
  return (
    <div className="rounded-[18px] bg-white/[0.04] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <SectionLabel title="Execution Pipeline" compact />
      <div className="mt-4 flex items-center">
        {PIPELINE.map((step, index) => {
          const stepIndex = index + 1;
          const reached = phaseIndex >= stepIndex;
          const current = isActive && phaseIndex === stepIndex;
          const failed = isFailed && phaseIndex === stepIndex;
          const complete = reached && !current && !failed;

          return (
            <div key={step.id} className="flex min-w-0 flex-1 items-center">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full",
                    complete && "bg-emerald-300/12 text-emerald-100",
                    current && "bg-primary/12 text-primary",
                    failed && "bg-rose-300/12 text-rose-100",
                    !reached && "bg-white/[0.06] text-white/34",
                  )}
                >
                  {current ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : complete ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : failed ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold">{stepIndex}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    reached ? "text-white/78" : "text-white/34",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < PIPELINE.length - 1 && (
                <div className="mx-2 h-[2px] flex-1 rounded-full bg-white/[0.06]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      phaseIndex > stepIndex
                        ? "bg-emerald-300"
                        : current
                          ? "bg-primary"
                          : failed
                            ? "bg-rose-300"
                            : "bg-transparent",
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-white/52">
        {isActive ? "Run in progress." : latestTitle || STATUS_LABEL[status]}
      </p>
    </div>
  );
}

function RunListItem({
  run,
  isSelected,
  onSelect,
}: {
  run: AgentRun;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl px-4 py-3 text-left transition",
        isSelected
          ? "bg-white/[0.08] shadow-[inset_0_0_0_1px_rgba(180,197,255,0.14)]"
          : "bg-white/[0.03] hover:bg-white/[0.05]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 h-10 w-1 shrink-0 rounded-full",
            run.status === "awaiting_review"
              ? "bg-amber-400"
              : run.status === "approved"
                ? "bg-emerald-400"
                : run.status === "failed" || run.status === "rejected"
                  ? "bg-rose-400"
                  : run.status === "running" || run.status === "validating" || run.status === "preparing"
                    ? "bg-primary"
                    : "bg-white/12",
          )}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-semibold text-white/88">
              {run.issue?.title ?? run.issueUrl}
            </p>
            <StatusBadge status={run.status} compact />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/34">
            <span className="font-mono">{run.issue?.number ? `#${run.issue.number}` : run.id.slice(0, 8)}</span>
            <span>{fmtRelative(run.updatedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: AgentRunStatus;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold uppercase tracking-[0.12em]",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        STATUS_ACCENTS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function ValidationBadge({
  status,
}: {
  status: AgentRun["artifacts"]["validation"]["overallStatus"];
}) {
  const tone =
    status === "passed"
      ? "bg-emerald-300/12 text-emerald-100"
      : status === "partial"
        ? "bg-amber-300/12 text-amber-100"
        : status === "failed"
          ? "bg-rose-300/12 text-rose-100"
          : "bg-white/[0.06] text-white/52";

  return (
    <span className={cn("rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", tone)}>
      {humanizeValidation(status)}
    </span>
  );
}

function CompactMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof FileCode2;
}) {
  return (
    <div className="rounded-[16px] bg-[#0f1830] px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-white">{value}</div>
    </div>
  );
}

function InlineMeta({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
      {label} {value}
    </span>
  );
}

function SectionLabel({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div className={cn("text-[11px] font-semibold uppercase tracking-[0.2em] text-white/34", compact && "text-[10px]")}>
      {title}
    </div>
  );
}

function LogBox({ label, content }: { label: string; content: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-[#060e20] shadow-[inset_0_0_0_1px_rgba(65,71,85,0.12)]">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
        {label}
      </div>
      <ScrollArea className="h-44">
        <pre className="whitespace-pre-wrap p-3 text-xs leading-5 text-white/72">
          <code>{content || "(empty)"}</code>
        </pre>
      </ScrollArea>
    </div>
  );
}

function SimpleNote({
  tone,
  text,
}: {
  tone: "warning" | "neutral";
  text: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-4 py-3 text-sm leading-6",
        tone === "warning"
          ? "bg-amber-300/10 text-amber-100"
          : "bg-white/[0.04] text-white/64",
      )}
    >
      {text}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-8 text-center text-sm text-white/42">
      {text}
    </div>
  );
}

function humanizeValidation(status: AgentRun["artifacts"]["validation"]["overallStatus"]) {
  if (status === "not_run") return "Not run";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
