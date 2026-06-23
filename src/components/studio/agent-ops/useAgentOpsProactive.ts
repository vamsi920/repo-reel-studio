import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  findSelectedProactiveCandidate,
  reconcileProactiveSelection,
  resolveProactiveReadyCount,
} from "@/components/studio/agent-ops/agentRunsPanelHelpers";
import type { AgentOpsWorkspaceTab } from "@/components/studio/agent-ops/types";
import {
  mergeProactiveBackendAttention,
  mergeProactiveStatusAfterToggle,
  nextProactiveSelectionAfterDismiss,
  patchProactiveCandidateState,
} from "@/components/studio/agent-ops/proactive/proactiveInteraction";
import { toast } from "@/hooks/use-toast";
import { parseAgentOpsAttention } from "@/lib/agentOpsAttention";
import type { AgentRun } from "@/lib/agentRuns";
import {
  approveProactiveCandidate,
  dismissProactiveCandidate,
  dispatchProactiveDaily,
  getProactiveStatus,
  updateProactiveConfig,
  type ProactiveCandidate,
  type ProactiveStatus,
} from "@/lib/proactiveAgentOps";
import {
  areProactiveStatusesEqual,
  proactiveCandidateIdsKey,
} from "@/components/studio/agent-ops/shared/agentOpsListEquality";
import { createSerialTaskRunner, nextFailureCount } from "@/lib/agentOpsPolling";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";
import type { RunDetailTab } from "@/components/studio/agent-ops/runs/runInspectorTabs";

type UseAgentOpsProactiveOptions = {
  repoUrl: string;
  projectId?: string | null;
  repoName: string;
  contextHints: Record<string, unknown> | null;
  runs: AgentRun[];
  selectedRunId: string | null;
  setRuns: React.Dispatch<React.SetStateAction<AgentRun[]>>;
  setSelectedRunId: (runId: string | null) => void;
  setWorkspaceTab: (tab: AgentOpsWorkspaceTab) => void;
  setActiveTab: (tab: RunDetailTab) => void;
  loadRuns: (preferredId?: string | null, options?: { silent?: boolean }) => Promise<boolean>;
};

export function useAgentOpsProactive({
  repoUrl,
  projectId,
  repoName,
  contextHints,
  runs,
  selectedRunId,
  setRuns,
  setSelectedRunId,
  setWorkspaceTab,
  setActiveTab,
  loadRuns,
}: UseAgentOpsProactiveOptions) {
  const [proactiveStatus, setProactiveStatus] = useState<ProactiveStatus | null>(null);
  const [proactiveLoading, setProactiveLoading] = useState(false);
  const [proactiveSyncing, setProactiveSyncing] = useState(false);
  const [proactiveAction, setProactiveAction] = useState<string | null>(null);
  const [proactiveBackendAttention, setProactiveBackendAttention] = useState<AgentOpsAttention | null>(null);
  const [selectedProactiveId, setSelectedProactiveId] = useState<string | null>(null);

  const proactivePollFailuresRef = useRef(0);
  const proactiveTaskRunnerRef = useRef(createSerialTaskRunner());
  const proactiveStatusRef = useRef<ProactiveStatus | null>(null);
  const proactiveActionRef = useRef<string | null>(null);
  const selectedProactiveIdRef = useRef<string | null>(null);
  const runsRef = useRef(runs);

  proactiveStatusRef.current = proactiveStatus;
  proactiveActionRef.current = proactiveAction;
  selectedProactiveIdRef.current = selectedProactiveId;
  runsRef.current = runs;

  const loadProactive = useCallback(
    async (options?: { manual?: boolean; silent?: boolean }) => {
      if (!repoUrl) return false;
      const result = await proactiveTaskRunnerRef.current.run(async () => {
        const silent = options?.silent ?? !options?.manual;
        if (options?.manual) setProactiveLoading(true);
        else if (!silent) setProactiveSyncing(true);
        try {
          const status = await getProactiveStatus({ repoUrl, projectId });
          setProactiveStatus((previous) => (areProactiveStatusesEqual(previous, status) ? previous : status));
          setProactiveBackendAttention(null);
          proactivePollFailuresRef.current = 0;
          return true;
        } catch (nextError) {
          proactivePollFailuresRef.current = nextFailureCount(proactivePollFailuresRef.current, false);
          setProactiveBackendAttention(
            parseAgentOpsAttention(
              nextError instanceof Error ? nextError.message : "Proactive backend is unavailable.",
              "proactive",
            ),
          );
          return false;
        } finally {
          if (options?.manual) setProactiveLoading(false);
          else if (!silent) setProactiveSyncing(false);
        }
      });
      return result.status === "completed" ? Boolean(result.value) : false;
    },
    [projectId, repoUrl],
  );

  useEffect(() => {
    void loadProactive({ manual: true });
  }, [loadProactive]);

  const proactiveSelectionKey = useMemo(
    () => proactiveCandidateIdsKey(proactiveStatus?.candidates ?? []),
    [proactiveStatus?.candidates],
  );

  useEffect(() => {
    const candidates = proactiveStatus?.candidates ?? [];
    const nextId = reconcileProactiveSelection(candidates, selectedProactiveId);
    if (nextId !== selectedProactiveId) setSelectedProactiveId(nextId);
  }, [proactiveSelectionKey, proactiveStatus?.candidates, selectedProactiveId]);

  const setProactiveCandidate = useCallback((candidate: ProactiveCandidate, options?: { batch?: ProactiveStatus["batch"] }) => {
    setProactiveStatus((previous) =>
      patchProactiveCandidateState(previous, candidate, {
        removeFromList: candidate.status === "dismissed",
        batch: options?.batch ?? previous?.batch,
      }),
    );
  }, []);

  const toggleProactive = useCallback(
    async (enabled: boolean) => {
      if (!repoUrl) return;
      setProactiveAction("toggle");
      try {
        const config = await updateProactiveConfig({ repoUrl, projectId, enabled });
        setProactiveStatus((previous) => mergeProactiveStatusAfterToggle(previous, config));
        setProactiveBackendAttention(null);
        await loadProactive({ manual: false });
      } catch (nextError) {
        setProactiveBackendAttention(
          parseAgentOpsAttention(
            nextError instanceof Error ? nextError.message : "Could not update proactive mode.",
            "proactive",
          ),
        );
      } finally {
        setProactiveAction(null);
      }
    },
    [loadProactive, projectId, repoUrl],
  );

  const dispatchProactive = useCallback(async () => {
    if (!repoUrl) return;
    setProactiveAction("dispatch");
    try {
      const status = await dispatchProactiveDaily({
        repoUrl,
        repoName,
        projectId,
        contextHints,
        targetCount: proactiveStatus?.config.targetCount ?? 6,
      });
      setProactiveStatus(status);
      setProactiveBackendAttention(null);
      proactivePollFailuresRef.current = 0;
      void loadRuns(selectedRunId, { silent: true });
      const dispatchState = status.dispatchStatus;
      if (dispatchState === "in_progress") {
        toast({
          title: "Dispatch already running",
          description: status.dispatchReason ?? "Wait for the active batch to finish before starting another scan.",
        });
      } else if (dispatchState === "unchanged") {
        toast({
          title: "No new scan started",
          description:
            status.dispatchReason ??
            "Today's batch already completed for this repository HEAD. Push new commits or try again tomorrow.",
        });
      } else if (dispatchState === "skipped") {
        toast({
          title: "Proactive mode is off",
          description:
            status.dispatchReason ??
            "Enable proactive mode in settings or use cron only for enabled repos. This request did not start a batch.",
        });
      } else {
        toast({ title: "Proactive dispatch complete", description: "Candidates are ready for internal review." });
      }
    } catch (nextError) {
      setProactiveBackendAttention(
        parseAgentOpsAttention(nextError instanceof Error ? nextError.message : "Dispatch failed.", "proactive"),
      );
    } finally {
      setProactiveAction(null);
    }
  }, [contextHints, loadRuns, projectId, proactiveStatus?.config.targetCount, repoName, repoUrl, selectedRunId]);

  const approveCandidate = useCallback(
    async (candidate: ProactiveCandidate) => {
      setProactiveAction(`approve:${candidate.id}`);
      try {
        const result = await approveProactiveCandidate(candidate.id);
        setProactiveCandidate(result.candidate);
        if (result.run) {
          const run = result.run as AgentRun;
          setRuns((previous) => [run, ...previous.filter((item) => item.id !== run.id)]);
          setSelectedRunId(run.id);
          setWorkspaceTab("runs");
          setActiveTab("summary");
        }
        toast({ title: "Approved", description: "Opening a PR from the linked Agent Ops run." });
      } catch (nextError) {
        setProactiveBackendAttention(
          parseAgentOpsAttention(nextError instanceof Error ? nextError.message : "Approval failed.", "proactive"),
        );
      } finally {
        setProactiveAction(null);
      }
    },
    [setActiveTab, setProactiveCandidate, setRuns, setSelectedRunId, setWorkspaceTab],
  );

  const dismissCandidate = useCallback(
    async (candidate: ProactiveCandidate) => {
      setProactiveAction(`dismiss:${candidate.id}`);
      try {
        const result = await dismissProactiveCandidate(candidate.id, "Dismissed from Agent Ops.");
        setProactiveStatus((previous) => {
          const next = patchProactiveCandidateState(previous, result.candidate, {
            batch: result.batch ?? undefined,
          });
          if (next) {
            setSelectedProactiveId(
              nextProactiveSelectionAfterDismiss(next, candidate.id, selectedProactiveIdRef.current),
            );
          }
          return next;
        });
      } catch (nextError) {
        setProactiveBackendAttention(
          parseAgentOpsAttention(nextError instanceof Error ? nextError.message : "Dismiss failed.", "proactive"),
        );
      } finally {
        setProactiveAction(null);
      }
    },
    [],
  );

  const selectCandidateRun = useCallback(
    async (candidate: ProactiveCandidate) => {
      if (!candidate.runId) return;
      setWorkspaceTab("runs");
      setSelectedRunId(candidate.runId);
      setActiveTab("summary");
      if (!runsRef.current.some((run) => run.id === candidate.runId)) {
        await loadRuns(candidate.runId);
      }
    },
    [loadRuns, setActiveTab, setSelectedRunId, setWorkspaceTab],
  );

  const proactiveReadyCount = resolveProactiveReadyCount(proactiveStatus);
  const proactiveTarget = proactiveStatus?.target ?? proactiveStatus?.config.targetCount ?? 6;
  const selectedProactiveCandidate = useMemo(
    () => findSelectedProactiveCandidate(proactiveStatus?.candidates ?? [], selectedProactiveId),
    [proactiveStatus?.candidates, selectedProactiveId],
  );

  const applyProactiveHealthAttention = useCallback((fromHealth: AgentOpsAttention | null) => {
    setProactiveBackendAttention((previous) =>
      mergeProactiveBackendAttention(fromHealth, previous, proactivePollFailuresRef.current > 0),
    );
  }, []);

  return {
    proactiveStatus,
    proactiveLoading,
    proactiveSyncing,
    proactiveAction,
    proactiveBackendAttention,
    selectedProactiveId,
    setSelectedProactiveId,
    proactiveReadyCount,
    proactiveTarget,
    selectedProactiveCandidate,
    proactiveStatusRef,
    proactiveActionRef,
    proactivePollFailuresRef,
    loadProactive,
    toggleProactive,
    dispatchProactive,
    approveCandidate,
    dismissCandidate,
    selectCandidateRun,
    applyProactiveHealthAttention,
  };
}
