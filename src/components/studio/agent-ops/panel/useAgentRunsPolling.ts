import { useEffect, useRef } from "react";

import { isProactiveWorkActive } from "@/components/studio/agent-ops/agentRunsPanelHelpers";
import type { AgentOpsWorkspaceTab } from "@/components/studio/agent-ops/types";
import {
  computeProactivePollIntervalMs,
  computeRunsPollIntervalMs,
  PROACTIVE_POLL_IDLE_MS,
} from "@/lib/agentOpsPolling";
import type { ProactiveStatus } from "@/lib/proactiveAgentOps";

type UseAgentRunsPollingOptions = {
  repoUrl: string;
  workspaceTab: AgentOpsWorkspaceTab;
  selectedIdRef: React.MutableRefObject<string | null>;
  runsWorkActiveRef: React.MutableRefObject<boolean>;
  runsPollFailuresRef: React.MutableRefObject<number>;
  loadRunsRef: React.MutableRefObject<
    (preferredId?: string | null, options?: { silent?: boolean }) => Promise<boolean>
  >;
  proactiveStatusRef: React.MutableRefObject<ProactiveStatus | null>;
  proactiveActionRef: React.MutableRefObject<string | null>;
  proactivePollFailuresRef: React.MutableRefObject<number>;
  proactiveBackendDownRef: React.MutableRefObject<boolean>;
  loadProactiveRef: React.MutableRefObject<
    (options?: { manual?: boolean; silent?: boolean }) => Promise<boolean>
  >;
};

export function useAgentRunsPolling({
  repoUrl,
  workspaceTab,
  selectedIdRef,
  runsWorkActiveRef,
  runsPollFailuresRef,
  loadRunsRef,
  proactiveStatusRef,
  proactiveActionRef,
  proactivePollFailuresRef,
  proactiveBackendDownRef,
  loadProactiveRef,
}: UseAgentRunsPollingOptions) {
  const workspaceTabRef = useRef(workspaceTab);
  workspaceTabRef.current = workspaceTab;

  useEffect(() => {
    if (!repoUrl) return;
    let cancelled = false;
    let timer: number | undefined;
    let pollInFlight = false;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (cancelled || pollInFlight) return;
      pollInFlight = true;
      try {
        const status = proactiveStatusRef.current;
        const action = proactiveActionRef.current;
        const proactiveWorkActive = isProactiveWorkActive(status, action);
        const runsWorkActive = runsWorkActiveRef.current;
        const tab = workspaceTabRef.current;
        const backendDown = proactiveBackendDownRef.current;

        const shouldPollProactive = proactiveWorkActive || runsWorkActive || tab === "proactive";
        const shouldPollRuns = proactiveWorkActive || runsWorkActive;

        if (shouldPollProactive) {
          await loadProactiveRef.current({ silent: true });
        }

        if (shouldPollRuns) {
          await loadRunsRef.current(selectedIdRef.current, { silent: true });
        }

        const proactiveDelay = computeProactivePollIntervalMs({
          backendUnavailable: backendDown,
          consecutiveFailures: proactivePollFailuresRef.current,
          workActive: proactiveWorkActive,
        });
        const runsDelay = computeRunsPollIntervalMs({
          backendUnavailable: backendDown,
          consecutiveFailures: runsPollFailuresRef.current,
          workActive: runsWorkActive,
        });

        if (proactiveWorkActive || runsWorkActive) {
          schedule(Math.min(proactiveDelay, runsDelay));
          return;
        }

        if (tab === "proactive") {
          schedule(proactiveDelay);
          return;
        }

        if (runsWorkActive) {
          schedule(runsDelay);
        }
      } finally {
        pollInFlight = false;
      }
    };

    schedule(PROACTIVE_POLL_IDLE_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [repoUrl]);
}
