import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractGitHubRepoKey } from "@/components/studio/agent-ops/panel/agentRunsPanelUtils";
import type { SelectedRunView } from "@/components/studio/agent-ops/panel/types";
import { RUN_ACTIVE_STATUSES, getRunPhaseIndex } from "@/components/studio/agent-ops/runs/runPipeline";
import { RUN_STATUS_LABEL } from "@/components/studio/agent-ops/runs/runStatusDisplay";
import {
  areAgentRunsListsEqual,
  countActiveRuns,
  runsHaveActiveWork,
} from "@/components/studio/agent-ops/shared/agentOpsListEquality";
import { toast } from "@/hooks/use-toast";
import { resolveAgentBackendAttention } from "@/lib/agentOpsAttention";
import {
  approveAgentRun,
  cancelAgentRun,
  createAgentRun,
  fetchIngestionHealth,
  getAgentRun,
  listAgentRuns,
  rejectAgentRun,
  type AgentRun,
  type IngestionHealth,
} from "@/lib/agentRuns";
import { normalizeIngestionHealth } from "@/lib/agentOpsHealth";
import { createSerialTaskRunner, nextFailureCount } from "@/lib/agentOpsPolling";
import { buildProactiveContextHints } from "@/lib/proactiveContextHints";
import type { GitNexusGraphData, VideoManifest } from "@/lib/types";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";

type UseAgentRunsLaneOptions = {
  repoUrl: string;
  repoName: string;
  projectId?: string | null;
  manifest: VideoManifest | null;
  graphData: GitNexusGraphData | null;
  onProactiveHealthAttention: (fromHealth: AgentOpsAttention | null) => void;
};

export function useAgentRunsLane({
  repoUrl,
  repoName,
  projectId,
  manifest,
  graphData,
  onProactiveHealthAttention,
}: UseAgentRunsLaneOptions) {
  const [issueUrl, setIssueUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [approveBranch, setApproveBranch] = useState("");
  const [runFilter, setRunFilter] = useState("");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [syncingRuns, setSyncingRuns] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | "cancel" | "retry" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentBackendAttention, setAgentBackendAttention] = useState<AgentOpsAttention | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  const runsRef = useRef<AgentRun[]>([]);
  const runsWorkActiveRef = useRef(false);
  const runsPollFailuresRef = useRef(0);
  const runsTaskRunnerRef = useRef(createSerialTaskRunner());
  const loadRunsRef = useRef<
    (preferredId?: string | null, options?: { silent?: boolean }) => Promise<boolean>
  >(async () => false);

  selectedIdRef.current = selectedId;
  runsRef.current = runs;
  runsWorkActiveRef.current = runsHaveActiveWork(runs);

  const contextHints = useMemo(() => buildProactiveContextHints(manifest, graphData), [manifest, graphData]);
  const repoKey = useMemo(() => extractGitHubRepoKey(repoUrl), [repoUrl]);
  const isGitHub = useMemo(() => {
    try {
      return new URL(repoUrl).hostname.includes("github.com");
    } catch {
      return false;
    }
  }, [repoUrl]);

  const loadRuns = useCallback(
    async (preferredId?: string | null, options?: { silent?: boolean }) => {
      if (!repoUrl) return false;
      const result = await runsTaskRunnerRef.current.run(async () => {
        const silent = options?.silent === true;
        if (!silent) setLoadingRuns(true);
        try {
          const next = await listAgentRuns({ repoUrl, projectId, limit: 24 });
          setRuns((previous) => (areAgentRunsListsEqual(previous, next) ? previous : next));
          const pick = preferredId ?? selectedIdRef.current;
          if (pick && next.some((run) => run.id === pick)) {
            if (selectedIdRef.current !== pick) setSelectedId(pick);
          } else {
            const fallback = next[0]?.id ?? null;
            if (selectedIdRef.current !== fallback) setSelectedId(fallback);
          }
          runsPollFailuresRef.current = 0;
          runsWorkActiveRef.current = runsHaveActiveWork(next);
          return true;
        } catch (nextError) {
          runsPollFailuresRef.current = nextFailureCount(runsPollFailuresRef.current, false);
          if (!silent) {
            setError(nextError instanceof Error ? nextError.message : "Failed to load runs");
          }
          return false;
        } finally {
          if (!silent) setLoadingRuns(false);
        }
      });
      return result.status === "completed" ? Boolean(result.value) : false;
    },
    [projectId, repoUrl],
  );

  loadRunsRef.current = loadRuns;

  useEffect(() => {
    void loadRuns(undefined, { silent: false });
  }, [loadRuns, projectId, repoUrl]);

  const applyIngestionHealth = useCallback(
    (raw: IngestionHealth | null) => {
      const normalized = normalizeIngestionHealth(raw);
      setAgentBackendAttention(resolveAgentBackendAttention(normalized));
      onProactiveHealthAttention(resolveProactiveBackendAttention(normalized));
    },
    [onProactiveHealthAttention],
  );

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const raw = await fetchIngestionHealth();
      if (cancelled) return;
      applyIngestionHealth(raw);
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [applyIngestionHealth]);

  const selected = useMemo(() => runs.find((run) => run.id === selectedId) ?? null, [runs, selectedId]);

  useEffect(() => {
    if (selected?.approval?.branchName) {
      setApproveBranch(selected.approval.branchName);
    }
  }, [selected?.approval?.branchName]);

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
        RUN_STATUS_LABEL[run.status],
        run.status.replace(/_/g, " "),
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
        toast({ title: "Run started", description: `Tracking ${run.id.slice(0, 8)}` });
        return run;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to start run");
        return null;
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

  const activeRunCount = useMemo(() => countActiveRuns(runs), [runs]);

  const selectedRunView = useMemo((): SelectedRunView | null => {
    if (!selected) return null;
    const isActive = RUN_ACTIVE_STATUSES.includes(selected.status);
    return {
      phaseIndex: getRunPhaseIndex(selected.status),
      isActive,
      isReview: selected.status === "awaiting_review",
      isFailed: selected.status === "failed" || selected.status === "cancelled",
      latestTitle: selected.timeline[selected.timeline.length - 1]?.title ?? null,
    };
  }, [selected]);

  const handleIssueUrlChange = useCallback((value: string) => {
    setIssueUrl(value);
    setError(null);
  }, []);

  const handleRefreshRuns = useCallback(() => {
    void loadRuns(selectedId);
  }, [loadRuns, selectedId]);

  const focusComposer = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return {
    issueUrl,
    branch,
    approveBranch,
    setApproveBranch,
    runFilter,
    setRunFilter,
    runs,
    setRuns,
    selectedId,
    setSelectedId,
    loadingRuns,
    syncingRuns,
    submitting,
    refreshing,
    action,
    error,
    agentBackendAttention,
    setAgentBackendAttention,
    inputRef,
    selectedIdRef,
    runsRef,
    runsWorkActiveRef,
    runsPollFailuresRef,
    loadRunsRef,
    loadRuns,
    isGitHub,
    pendingReview,
    filteredRuns,
    selected,
    selectedRunView,
    activeRunCount,
    startRun,
    refreshSelected,
    approve,
    reject,
    cancel,
    retry,
    handleIssueUrlChange,
    handleRefreshRuns,
    focusComposer,
    setBranch,
  };
}
