import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import type { AgentRun } from "@/lib/agentRuns";

export type PrPublicationSnapshot = {
  prUrl: string | null;
  hasReadable: boolean;
  hasDraft: boolean;
  needsApproval: boolean;
  isRunActive: boolean;
  approvalStatus: AgentRun["approval"]["status"];
};

export function buildPrPublicationSnapshot(
  run: AgentRun,
  isRunActive: boolean,
  isReview: boolean,
): PrPublicationSnapshot {
  return {
    prUrl: run.approval?.prUrl?.trim() || null,
    hasReadable: Boolean(run.artifacts.prReadable),
    hasDraft: Boolean(run.artifacts.prDraft?.title || run.artifacts.prDraft?.body),
    needsApproval: isReview || run.approval?.status === "pending",
    isRunActive,
    approvalStatus: run.approval?.status ?? "pending",
  };
}

export function prPublicationHeadline(snapshot: PrPublicationSnapshot): {
  title: string;
  detail: string;
  tone: "open" | "draft" | "pending" | "idle" | "approval";
} {
  if (snapshot.prUrl) {
    return {
      title: "PR open",
      detail: "Link is live on GitHub.",
      tone: "open",
    };
  }
  if (snapshot.needsApproval && (snapshot.hasReadable || snapshot.hasDraft)) {
    return {
      title: "Draft ready",
      detail: AGENT_OPS_COPY.prApproveNote,
      tone: "approval",
    };
  }
  if (snapshot.hasReadable || snapshot.hasDraft) {
    return {
      title: "Draft ready",
      detail: "Review below. Open a PR after approval if still pending.",
      tone: "draft",
    };
  }
  if (snapshot.isRunActive) {
    return {
      title: "PR pending",
      detail: "Draft appears after patch and validation finish.",
      tone: "pending",
    };
  }
  return {
    title: "No PR",
    detail: "No draft or review packet on this run.",
    tone: "idle",
  };
}
